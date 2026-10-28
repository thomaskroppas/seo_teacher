/* Запуск: определяем режим (сервер/локально), входим, рисуем интерфейс. Регистрируем service worker для установки как приложения. */
App.Auth.start();
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { /* не критично */ }));
}
