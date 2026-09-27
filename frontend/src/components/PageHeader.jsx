import { motion } from 'framer-motion';

export function PageHeader({ eyebrow, title, children }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-wrap items-end justify-between gap-4"
        >
            <div>
                <p className="mono text-[10px] tracking-[0.35em] text-sky-400">{eyebrow}</p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-wide mt-2">{title}</h1>
            </div>
            {children}
        </motion.div>
    );
}
