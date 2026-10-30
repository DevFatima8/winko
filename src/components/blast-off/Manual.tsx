const STEPS = [
  {
    n: "01",
    t: "Set your stake",
    d: "Anything from 10 to 5,000 Rs. Stake is pulled from your balance the moment the launch window closes — not a second earlier — so you can still cancel while the countdown runs.",
  },
  {
    n: "02",
    t: "Arm your target",
    d: "Type the multiplier you want to be paid at and arm auto cash-out. The rocket is calibrated so that your target is cleared on 35 of every 100 launches and buried on the other 65.",
  },
  {
    n: "03",
    t: "Bail before the hull breaches",
    d: "Watch the curve. Hit CASH OUT (or the space bar) at any point in flight to lock the live multiplier. If the hull cracks first, the stake is gone — no second chances on this airframe.",
  },
];

const PAYOUTS = [
  { m: "1.20×", p: "120", f: "Very high probability" },
  { m: "1.50×", p: "150", f: "High probability" },
  { m: "2.00×", p: "200", f: "Standard target" },
  { m: "3.00×", p: "300", f: "Moderate" },
  { m: "5.00×", p: "500", f: "Low" },
  { m: "10.00×", p: "1,000", f: "Very low" },
  { m: "50.00×", p: "5,000", f: "Rare" },
];

const SPECS = [
  ["Max multiplier", "250.00×"],
  ["Min stake", "Rs. 10"],
  ["Round cycle", "≈ 12 s"],
  ["Auto cash-out", "1.01× – 200.00×"],
];

export default function Manual() {
  return (
    <section className="mx-auto max-w-[1500px] px-4 pt-20 pb-8 sm:px-8 lg:pt-28">
      <div className="grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
        {/* ---- left: editorial two-column measure ---- */}
        <div>
          <div className="legend mb-4">Flight manual</div>
          <h2
            className="font-display leading-[0.92] font-bold tracking-[-0.035em] text-white"
            style={{ fontSize: "clamp(2.4rem, 5.2vw, 4.6rem)" }}
          >
            Three controls.
            <br />
            <span className="text-launch">One rule:</span> leave
            <br />
            before it cracks.
          </h2>

          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s.n} className="border-t border-hair pt-5">
                <div className="num mb-3 text-[13px] font-bold tracking-[0.18em] text-launch">{s.n}</div>
                <h3 className="font-display mb-2 text-[19px] leading-tight font-semibold text-white">{s.t}</h3>
                <p className="text-[13.5px] leading-[1.75] text-mist">{s.d}</p>
              </div>
            ))}
            <div className="border-t border-hair pt-5">
              <div className="num mb-3 text-[13px] font-bold tracking-[0.18em] text-launch">04</div>
              <h3 className="font-display mb-2 text-[19px] leading-tight font-semibold text-white">Refuel any time</h3>
              <p className="text-[13.5px] leading-[1.75] text-mist">
                Balance runs on Rs. stored in your browser only. Hit REFUEL in the top bar whenever the
                tank dips under Rs. 1,000.
              </p>
            </div>
          </div>
        </div>

        {/* ---- right: tables, screen-printed panel ---- */}
        <div>
          <div className="panel mb-6">
            <div className="flex items-center justify-between border-b border-hair px-5 py-3">
              <span className="legend text-white/80">Game specs</span>
              <span className="num text-[11px] text-launch">CALIBRATED</span>
            </div>
            <div className="px-5 py-6">
              <div className="grid grid-cols-2 gap-px bg-hair">
                {SPECS.map(([k, v]) => (
                  <div key={k} className="bg-void px-3 py-3">
                    <div className="legend mb-1">{k}</div>
                    <div className="num text-[14px] text-white">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel-solid">
            <div className="flex items-center justify-between border-b border-hair px-5 py-3">
              <span className="legend text-white/80">Payout table</span>
              <span className="legend text-mist/80">on a Rs. 100 stake</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-hair">
                  <th className="legend px-5 py-2.5 text-left">Multiplier</th>
                  <th className="legend px-5 py-2.5 text-right">Return</th>
                  <th className="legend px-5 py-2.5 text-right">Odds band</th>
                </tr>
              </thead>
              <tbody>
                {PAYOUTS.map((row, i) => (
                  <tr key={row.m} className={i % 2 ? "bg-graphite-2/50" : ""}>
                    <td className="num px-5 py-2.5 text-[13px] text-inst">{row.m}</td>
                    <td className="num px-5 py-2.5 text-right text-[13px] text-white">Rs. {row.p}</td>
                    <td className="px-5 py-2.5 text-right text-[11px] tracking-[0.12em] text-mist uppercase">
                      {row.f}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
