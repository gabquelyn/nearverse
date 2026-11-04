"use client";
// The first-visit tour. It never blocks the game, so you can drive while you read.
import { memo, useEffect, useState } from "react";
import { useGame } from "@/lib/state/game";
import { isTouch } from "@/lib/landscape";

const KEY = "nearverse.tourDone";

export const Tour = memo(function Tour() {
  const setToured = useGame((s) => s.setToured);
  const [step, setStep] = useState(-1), [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(isTouch());
    let done = false; try { done = localStorage.getItem(KEY) === "1"; } catch { /* show it */ }
    if (done) setToured(); else setStep(0);
  }, [setToured]);
  if (step < 0) return null;
  const steps = [
    { title: "Welcome to Nearverse", text: "Hunt for hidden resources across a huge island, sell them, and own a piece of the market." },
    { title: "Drive", text: touch ? "Push the stick up to go and down to reverse, and left or right to turn. Use + and − to zoom." : "Use WASD or the arrow keys. Shift boosts, Space jumps and R takes you home. Use + and − or the scroll wheel to zoom." },
    { title: "Hunt", text: `Resources aren't on the map. You'll get a notice when one is close, and a glowing marker shows where to stop. Then hold ${touch ? "Load" : "E"}. Far spots are guarded by bombs, but pay a coin bonus.` },
    { title: "Sell", text: `The map shows merchants. They pay more when they're short of stock, and every sale moves the price. ${touch ? "Tap" : "Hover over"} a price to see why it's that number.` },
    { title: "Keep moving", text: "Fuel and repairs come out of the coins you earn, from the details panel. Credits buy new vehicles and stall locations." },
    { title: "Own a piece", text: "Buy a stall and earn from what it sells, or invest in a merchant for a share of its sales. A broke merchant stays closed until someone invests." },
  ];
  const finish = () => { setStep(-1); setToured(); try { localStorage.setItem(KEY, "1"); } catch { /* shown again next visit */ } };
  const s = steps[step];
  return (
    <section className="tour" aria-label="Tour" data-testid="tour">
      <small>{step + 1} of {steps.length}</small>
      <h3>{s.title}</h3>
      <p>{s.text}</p>
      <div className="row">
        {step > 0 && <button className="btn small ghost" onClick={() => setStep(step - 1)}>Back</button>}
        {step < steps.length - 1 ? <button className="btn small action" onClick={() => setStep(step + 1)}>Next</button> : <button className="btn small action" onClick={finish}>Start hunting</button>}
        {step < steps.length - 1 && <button className="btn small ghost" onClick={finish}>Skip tour</button>}
      </div>
    </section>
  );
});
