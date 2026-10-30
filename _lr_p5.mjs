import { patch } from "./_lr_patch.mjs";
patch("src/components/speed-baccarat/SpeedBaccaratGame.tsx", [
[`                        disabled={locked}
                        state={spotState(key)}`, `                        disabled={locked}
                        queueable
                        state={spotState(key)}`],
[`                        disabled={locked}
                        size="sm"`, `                        disabled={locked}
                        queueable
                        size="sm"`],
]);
