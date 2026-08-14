const api = window.beanIncognito;
const linkWindowMode = new URLSearchParams(window.location.search).get("mode") === "link";
if (linkWindowMode) document.body.classList.add("link-window");
const address = document.querySelector("#address");
const back = document.querySelector("#back");
const forward = document.querySelector("#forward");
const reload = document.querySelector("#reload");
const form = document.querySelector("#address-form");
const tabTitle = document.querySelector("#single-tab-title");

if (linkWindowMode) {
  back.textContent = "返回";
  forward.textContent = "前进";
  reload.textContent = "刷新";
}

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
  if (linkWindowMode) {
    const title = state.title || "新标签页";
    tabTitle.textContent = title;
    document.title = `${title} - Brizo`;
  } else {
    document.title = state.title ? `${state.title} - Private` : "Brizo - Incognito";
  }
});
