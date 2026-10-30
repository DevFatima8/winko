"use client";

import { ANIMALS, BEASTS, BET_SECONDS, BIRDS, GROUP_MULTIPLIER, SHARKS, WHEEL } from "./lib/game-config";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RulesModal({ open, onClose }: RulesModalProps) {
  if (!open) return null;

  const countOf = (id: string) => WHEEL.filter((w) => w === id).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="panel max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Game rules"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-gold text-2xl font-bold">How to play</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-white/85">
          <li>
            Each deal starts by flashing <b className="text-gold">START BET</b>. You have {BET_SECONDS} seconds to place
            your bets.
          </li>
          <li>Select a chip value, then tap any animal, BIRDS, BEASTS or a Shark to bet. Tap again to add more.</li>
          <li>
            When the timer hits zero, <b className="text-red-400">TIME&apos;S UP</b> flashes and the light starts running
            around the {WHEEL.length} lights.
          </li>
          <li>You win when the light stops on an animal you bet on. Winning stakes are returned together with the profit.</li>
          <li>Chicken, Ostrich, Owl and Eagle are Birds. Rabbit, Monkey, Panda and Lion are Beasts.</li>
          <li>Sharks belong to neither side: when a Shark is drawn, BIRDS and BEASTS bets lose.</li>
        </ol>

        <h3 className="font-display mt-5 text-lg font-bold text-white">Paytable</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-sky-500/10 p-2 ring-1 ring-sky-400/30">
            <div className="mb-1 font-bold text-sky-300">BIRDS · x{GROUP_MULTIPLIER}</div>
            {BIRDS.map((id) => (
              <PayRow key={id} id={id} count={countOf(id)} />
            ))}
          </div>
          <div className="rounded-xl bg-rose-500/10 p-2 ring-1 ring-rose-400/30">
            <div className="mb-1 font-bold text-rose-300">BEASTS · x{GROUP_MULTIPLIER}</div>
            {BEASTS.map((id) => (
              <PayRow key={id} id={id} count={countOf(id)} />
            ))}
          </div>
          <div className="col-span-2 rounded-xl bg-yellow-500/10 p-2 ring-1 ring-yellow-400/30">
            <div className="mb-1 font-bold text-yellow-300">SHARKS</div>
            <div className="grid grid-cols-2 gap-2">
              {SHARKS.map((id) => (
                <PayRow key={id} id={id} count={countOf(id)} />
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-white/50">
          Example: 1,000 on Lion → Lion drawn → 12,000 profit, 13,000 returned (1:12). 1,000 on BIRDS → any bird drawn →
          950 profit, 1,950 returned (1:{GROUP_MULTIPLIER}).
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-gradient-to-b from-yellow-300 to-yellow-600 py-3 font-display text-lg font-bold text-[#3a2500] shadow-lg"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function PayRow({ id, count }: { id: keyof typeof ANIMALS; count: number }) {
  const a = ANIMALS[id];
  return (
    <div className="flex items-center gap-2 py-0.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.image} alt="" className="h-6 w-6 rounded-full object-cover" />
      <span className="flex-1 text-white/85">{a.name}</span>
      <span className="text-[10px] text-white/40">{count} light{count > 1 ? "s" : ""}</span>
      <span className="text-gold w-10 text-right font-bold">x{a.multiplier}</span>
    </div>
  );
}
