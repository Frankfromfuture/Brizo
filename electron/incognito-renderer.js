const api = window.beanIncognito;
const address = document.querySelector("#address");
const back = document.querySelector("#back");
const forward = document.querySelector("#forward");
const reload = document.querySelector("#reload");
const form = document.querySelector("#address-form");

back.addEventListener("click", () => api.back());
forward.addEventListener("click", () => api.forward());
reload.addEventListener("click", () => api.reload());
form.addEventListener("submit", (event) => {
  event.preventDefault();
  api.navigate(address.value);
});
address.addEventListener("focus", () => address.select());

api.onState((state) => {
  if (document.activeElement !== address) address.value = state.url || "";
  back.disabled = !state.canGoBack;
  forward.disabled = !state.canGoForward;
  document.title = state.title ? `${state.title} - Private` : "Brizo - Incognito";
});
