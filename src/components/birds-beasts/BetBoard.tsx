"use client";

import {
  ANIMALS,
  BEASTS,
  BIRDS,
  GROUP_MULTIPLIER,
  SHARKS,
  formatShort,
  type Animal,
  type AnimalId,
  type BetKey,
  type Bets,
} from "./lib/game-config";
import type { Phase } from "./types";

interface BetBoardProps {
  bets: Bets;
  phase: Phase;
  winningKeys: BetKey[];
  resultAnimal: AnimalId | null;
  onBet: (key: BetKey) => void;
}

export default function BetBoard({ bets, phase, winningKeys, resultAnimal, onBet }: BetBoardProps) {
  const locked = false;
  const showingResult = phase === "result";

  const isWinner = (key: BetKey) => {
    if (!showingResult || !resultAnimal) return false;
    if (winningKeys.includes(key)) return true;
    // Highlight the drawn animal / group even when no chip was on it
    if (key === resultAnimal) return true;
    if ((key === "birds" || key === "beasts") && ANIMALS[resultAnimal].group === key) return true;
    return false;
  };

  return (
    <div className="grid grid-cols-4 gap-1 sm:gap-1.5 md:gap-2">
      <GroupTile
        group="birds"
        label="BIRDS"
        members={BIRDS}
        amount={bets.birds ?? 0}
        locked={locked}
        winner={isWinner("birds")}
        dim={showingResult && !isWinner("birds")}
        onClick={() => onBet("birds")}
      />
      <GroupTile
        group="beasts"
        label="BEASTS"
        members={BEASTS}
        amount={bets.beasts ?? 0}
        locked={locked}
        winner={isWinner("beasts")}
        dim={showingResult && !isWinner("beasts")}
        onClick={() => onBet("beasts")}
      />

      {BIRDS.map((id) => (
        <AnimalTile
          key={id}
          animal={ANIMALS[id]}
          amount={bets[id] ?? 0}
          locked={locked}
          winner={isWinner(id)}
          dim={showingResult && !isWinner(id)}
          onClick={() => onBet(id)}
        />
      ))}
      {BEASTS.map((id) => (
        <AnimalTile
          key={id}
          animal={ANIMALS[id]}
          amount={bets[id] ?? 0}
          locked={locked}
          winner={isWinner(id)}
          dim={showingResult && !isWinner(id)}
          onClick={() => onBet(id)}
        />
      ))}
      {SHARKS.map((id) => (
        <SharkTile
          key={id}
          animal={ANIMALS[id]}
          amount={bets[id] ?? 0}
          locked={locked}
          winner={isWinner(id)}
          dim={showingResult && !isWinner(id)}
          onClick={() => onBet(id)}
        />
      ))}
    </div>
  );
}

/* ---------- tiles ---------- */

interface TileBase {
  amount: number;
  locked: boolean;
  winner: boolean;
  dim: boolean;
  onClick: () => void;
}

function BetBadge({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return (
    <span className="bet-badge" aria-label={`Bet ${amount}`}>
      {formatShort(amount)}
    </span>
  );
}

function GroupTile({
  group,
  label,
  members,
  amount,
  locked,
  winner,
  dim,
  onClick,
}: TileBase & { group: "birds" | "beasts"; label: string; members: AnimalId[] }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tile tile-group col-span-2 ${group === "birds" ? "tile-birds" : "tile-beasts"} ${
        winner ? "tile-win" : ""
      } ${dim ? "tile-dim" : ""} ${locked ? "tile-locked" : ""}`}
    >
      <div className="flex w-full items-center justify-between gap-1.5 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5">
        <div className="flex flex-col items-start leading-none">
          <span className="font-display text-sm sm:text-base md:text-lg font-bold tracking-wider text-white">{label}</span>
          <div className="mt-0.5 sm:mt-1 flex items-center gap-1">
            {members.map((id) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={id}
                src={ANIMALS[id].image}
                alt={ANIMALS[id].name}
                draggable={false}
                className="h-4 w-4 rounded-full border border-white/40 object-cover shadow sm:h-5 sm:w-5 md:h-6 md:w-6"
              />
            ))}
          </div>
        </div>
        <span className="tile-mult-big">x{GROUP_MULTIPLIER}</span>
      </div>
      <BetBadge amount={amount} />
    </button>
  );
}

function AnimalTile({ animal, amount, locked, winner, dim, onClick }: TileBase & { animal: Animal }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tile tile-animal ${animal.group === "birds" ? "tile-birds" : "tile-beasts"} ${
        winner ? "tile-win" : ""
      } ${dim ? "tile-dim" : ""} ${locked ? "tile-locked" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={animal.image} alt={animal.name} draggable={false} className="tile-img" />
      <span className="mt-0.5 text-[9px] sm:text-[10px] md:text-[11px] font-semibold uppercase tracking-wide text-white/85 leading-tight">
        {animal.name}
      </span>
      <span className="tile-mult">x{animal.multiplier}</span>
      <BetBadge amount={amount} />
    </button>
  );
}

function SharkTile({ animal, amount, locked, winner, dim, onClick }: TileBase & { animal: Animal }) {
  const golden = animal.id === "goldenShark";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tile tile-shark col-span-2 ${golden ? "tile-shark-gold" : "tile-shark-silver"} ${
        winner ? "tile-win" : ""
      } ${dim ? "tile-dim" : ""} ${locked ? "tile-locked" : ""}`}
    >
      <div className="flex w-full items-center gap-2 sm:gap-3 px-2 py-1 sm:px-3 sm:py-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={animal.image} alt={animal.name} draggable={false} className="tile-img !mt-0 h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10" />
        <div className="flex flex-col items-start leading-none">
          <span className="font-display text-xs sm:text-sm md:text-base font-bold tracking-wide text-white">
            {animal.name.toUpperCase()}
          </span>
          <span className="mt-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest text-white/60">
            {golden ? "Jackpot" : "Bonus"}
          </span>
        </div>
        <span className="tile-mult-big ml-auto">x{animal.multiplier}</span>
      </div>
      <BetBadge amount={amount} />
    </button>
  );
}
