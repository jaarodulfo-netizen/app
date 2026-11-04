# New AC controller → Access Levels / Enrollment

## Why a controller can be visible in Devices but missing from Enrollment

The cloud **Register Device** form historically created a database row only;
it did not create a real device in the Windows Gateway, link a stable
`gatewayDeviceId`, or register its physical doors. Access Levels and Enrollment
select real Gateway-linked door outputs, not manually typed IPs.

The Windows Gateway's authenticated WebSocket **register** message already
contains each enabled physical device's `id`, `name`, `role`, `doors` and
`online` status. The cloud now discovers missing ACs and facial terminals from
that inventory, reconciles an exact unique manually created same-name entry,
and inserts any missing door rows.

## Operator workflow

1. Back up the Windows Gateway configuration before editing it.
2. Add/enable the new AC in the **local Windows Gateway device configuration**
   using a unique stable ID, `role: controller`, and the real `doors`
   outputs (e.g. `[1,2,3,4]` for a 4-door DS-K2804). Verify the network,
   SDK credentials and SDK connectivity locally. This cloud change cannot
   configure the controller or discover a device that Gateway has not been told
   about.
3. Restart/reconnect the **Windows Gateway only** through a controlled
   maintenance procedure. It advertises its enabled devices upon connection.
4. In **Devices** click **REFRESH INVENTORY**. Confirm the AC has
   `GATEWAY ID: ...` and the expected output count, not `NOT LINKED`.
   If an old manual entry has exactly the same name and device type, it will be
   linked automatically; if names differ, the discovered device is shown as a
   separate linked entry. An unlinked entry grants no physical access.
5. In **Employees → Access Levels**, click **REFRESH INVENTORY**. The new AC
   output(s) should be listed as selectable door entries.
6. To add outputs to an existing Access Level, click **EDIT**, check only
   the intended door(s), then **SAVE LEVEL CHANGES → CONFIRM LEVEL UPDATE**.
   Existing access-level users get a new hardware queue request. This is
   **not proof** that every controller was reprogrammed.
7. To enroll a new person, open Enrollment and select the desired updated
   Access Level. Verify physical read-back on the relevant AC and facial
   terminals using a disposable test identity before relying on access.

## Safety boundaries

- No new permission is applied automatically by inventory discovery.
- A manual device with only name/IP stays `NOT LINKED` until an enabled
  Gateway device matches exactly on name and type or a new linked record
  is discovered.
- Only door numbers advertised in the authenticated Gateway inventory
  become new selectable outputs; firmware/model labels do not imply outputs.
- Existing door names, hidden/visible settings, positions, and assigned
  access-level rights are retained.
- Removing outputs from a level already assigned to employees is blocked
  because safely revoking old hardware credentials requires an explicit
  verified revocation workflow. This edit workflow is primarily for adding
  the new controller's outputs.
- Gateway queue acceptance does **not** guarantee physical card or face
  enrollment. Confirm on each device.

## Troubleshooting

If Devices shows `NOT LINKED`, the Windows Gateway has not advertised the
matching physical ID. Recheck the local config `enabled`, the exact device
name and role, the real outputs and the Gateway reconnect. Refreshing the
browser **alone** cannot force the Windows Gateway to re-register.

If the controller appears with zero outputs, check its local `doors` array.
Do not manually create fictional doors in MongoDB to work around this.

If an AC shows offline, verify connectivity, SDK port, credentials and
physical programming. The cloud stores the last Gateway-reported state; it
does not probe the LAN device directly.
