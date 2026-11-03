import "../shared/base.css";
import "./lab.css";

// Filter the experiment cards by kind; the choice is kept in the address (#play, #web, #tool) so it can be linked to.
const buttons = [...document.querySelectorAll<HTMLButtonElement>(".filters button")];
const cards = [...document.querySelectorAll<HTMLLIElement>(".cards > li")];

function show(kind: string): void {
  if (!buttons.some((b) => b.dataset.kind === kind)) kind = "all";
  for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.kind === kind));
  for (const c of cards) c.hidden = kind !== "all" && c.dataset.kind !== kind;
}

for (const b of buttons) b.addEventListener("click", () => {
  const kind = b.dataset.kind!;
  history.replaceState(null, "", kind === "all" ? location.pathname : "#" + kind);
  show(kind);
});
show(location.hash.slice(1));
