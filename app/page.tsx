import Link from "next/link";

function Crab({ size = 120 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-label="Mr Crabs"
      role="img"
      style={{ display: "block" }}
    >
      {/* left claw arm */}
      <path
        d="M30 70 Q12 58 14 36"
        stroke="#0a0a0a"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* right claw arm */}
      <path
        d="M90 70 Q108 58 106 36"
        stroke="#0a0a0a"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* legs left */}
      <path d="M30 80 L14 92" stroke="#0a0a0a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M34 88 L20 104" stroke="#0a0a0a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M42 92 L34 110" stroke="#0a0a0a" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* legs right */}
      <path d="M90 80 L106 92" stroke="#0a0a0a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M86 88 L100 104" stroke="#0a0a0a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M78 92 L86 110" stroke="#0a0a0a" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* body */}
      <ellipse cx="60" cy="76" rx="34" ry="22" fill="#ff5b3a" stroke="#0a0a0a" strokeWidth="3" />
      {/* belly highlight */}
      <ellipse cx="60" cy="84" rx="22" ry="9" fill="#ffb59c" opacity="0.65" />
      {/* mouth */}
      <path
        d="M50 82 Q60 90 70 82"
        stroke="#0a0a0a"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* eye stalks */}
      <line x1="50" y1="58" x2="48" y2="40" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" />
      <line x1="70" y1="58" x2="72" y2="40" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" />
      {/* eyes */}
      <circle cx="48" cy="36" r="7" fill="#fff" stroke="#0a0a0a" strokeWidth="2.5" />
      <circle cx="72" cy="36" r="7" fill="#fff" stroke="#0a0a0a" strokeWidth="2.5" />
      <circle cx="49" cy="37" r="3" fill="#0a0a0a" />
      <circle cx="73" cy="37" r="3" fill="#0a0a0a" />
      {/* claws — left */}
      <g transform="translate(14 36) rotate(-15)">
        <path
          d="M-12 -10 Q -2 -16 8 -10 Q 4 -2 -2 0 Z"
          fill="#ff5b3a"
          stroke="#0a0a0a"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M-12 -10 Q -6 -6 0 -8 Q -4 -2 -8 0 Z"
          fill="#ff8b6f"
          stroke="#0a0a0a"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
      {/* claws — right (mirrored) */}
      <g transform="translate(106 36) rotate(15) scale(-1 1)">
        <path
          d="M-12 -10 Q -2 -16 8 -10 Q 4 -2 -2 0 Z"
          fill="#ff5b3a"
          stroke="#0a0a0a"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M-12 -10 Q -6 -6 0 -8 Q -4 -2 -8 0 Z"
          fill="#ff8b6f"
          stroke="#0a0a0a"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <section className="flex-1 flex flex-col items-center justify-center px-8 py-20 text-center rise rise-1">
        <Crab size={140} />
        <h1
          className="font-bubble mt-6 text-[clamp(72px,14vw,160px)] leading-[0.95]"
          style={{ color: "var(--signal)" }}
        >
          Mr Crabs
        </h1>
        <p className="mt-8 max-w-[680px] font-serif text-[clamp(20px,2.4vw,30px)] leading-snug">
          Making B2B payments instant with agentic underwriting.
        </p>

        <div className="mt-16 w-full max-w-[520px] mx-auto">
          <Link
            href="/analyst"
            className="group block rule-t pt-5 pb-6 px-5 hover:bg-soft transition rise rise-2 text-left"
          >
            <div className="eyebrow mb-3">Analyst console</div>
            <span className="font-serif text-2xl">Underwrite inbound invoices →</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
