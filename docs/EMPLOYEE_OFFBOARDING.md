# Kerma Security V2 — Employee offboarding

## Objective

An offboarded employee must lose access across every card controller and
facial terminal where the identity may still be enrolled. Cloud roster deletion
alone does not revoke hardware credentials.

## Cloud workflow

1. Commander confirms OFFBOARD from Personnel.
2. Backend validates Person ID and registered Gateway access devices.
3. An audit record stores name, Person ID, card numbers, actor, time and all targets.
4. Employee is marked inactive, not physically erased from MongoDB history.
5. Backend issues a person.delete command over the authenticated Gateway websocket.
6. Existing Windows Gateway queues a person.delete job for EVERY configured local
   card controller and facial terminal, regardless of current door rights.
7. Cloud checks that the Gateway accepted jobs for all registered target devices.
8. When Gateway is offline, request remains pending and retries on reconnect.
9. Cloud blocks manual retry-sync, employee updates and access-level resync for
   the inactive person. Personnel shows pending/queued revocations.

## Mandatory physical verification

QUEUED IS NOT VERIFIED. The current Windows Gateway confirms only that jobs
entered its SQLite queue, not that the cards and faces were physically removed.
Local device job failure/retry exhaustion is possible. Operator must inspect
the Gateway and perform readback of the user, cards and facial credentials
before concluding the person can no longer open doors.

## Controlled acceptance test

Use a disposable TEST ONLY identity (never a real active employee):

1. Enroll a test card on a DS-K2804, a face template on a facial terminal and,
   when applicable, the attendance facial.
2. Confirm test credential works before offboarding.
3. Offboard in Personnel. Check audit shows all Gateway target device IDs.
4. Check the local SQLite sync_jobs table has person.delete entries per device.
5. Verify the test Person ID, each card and each face are ABSENT from every
   device and test credential now produces Access Denied.
6. Repeat with Gateway offline: cloud must show PENDING, not SUCCESS.
   Reconnect; the pending request must be delivered and queued.
7. Verify historical attendance/access event records remain intact.

## Remaining Gateway work

A versioned local Windows Gateway update should add per-device deletion
readback and status events, plus local tombstones to prohibit any stale queued
enrollment from restoring removed credentials. Until then the cloud screen
correctly displays HARDWARE UNVERIFIED. Additional site Gateways are currently
rejected rather than silently skipped.


## Personnel status and search

For commander users, Personnel includes a read-only history of employees whose
`is_active` field is false. The active employee endpoint remains unchanged so
other screens do not accidentally re-enroll, sync or assign old credentials.

The Personnel status column displays `DADO DE BAJA`, offboarding timestamp
in Monterrey local time, and the actor who performed the action. The status
filter supports active, offboarded and zero cloud door-rights personnel; the
last category does **not** claim that device credentials have been removed.

An offboarded row cannot be edited or re-synced. Its card/face status explicitly
shows `HARDWARE UNVERIFIED` until a future Gateway version can report and
validate per-device credential deletion. Re-enrollment is not available through
the archived view. Access history remains in its original collections.
