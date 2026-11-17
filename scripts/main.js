/**
 * Dark Souls Death Screen — Foundry VTT v13
 */
const MODULE_ID = "ds-death-screen";
const MODULE_PATH = `modules/${MODULE_ID}`;
const DEFAULT_IMAGE = `${MODULE_PATH}/assets/deathscreen.png`;
const DEFAULT_SOUND = `${MODULE_PATH}/assets/deathsound.mp3`;
const SOCKET = `module.${MODULE_ID}`;
const COOLDOWN_MS = 3000;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* -------------------------------------------- */
/*  Настройки                                   */
/* -------------------------------------------- */

function getConfig() {
  const g = (k) => game.settings.get(MODULE_ID, k);
  return {
    images: foundry.utils.deepClone(g("images")),
    mode: g("mode"),
    selected: g("selected"),
    sound: g("sound"),
    volume: g("volume"),
    fadeIn: g("fadeIn"),
    hold: g("hold"),
    fadeOut: g("fadeOut"),
    offset: g("offset"),
    autoEnable: g("autoEnable")
  };
}

function registerSettings() {
  const world = (key, type, def, extra = {}) =>
    game.settings.register(MODULE_ID, key, { scope: "world", config: false, type, default: def, ...extra });

  world("images", Array, [DEFAULT_IMAGE]);
  world("mode", String, "random");
  world("selected", String, DEFAULT_IMAGE);
  world("sound", String, DEFAULT_SOUND);
  world("volume", Number, 0.8);
  world("fadeIn", Number, 1500);
  world("hold", Number, 3000);
  world("fadeOut", Number, 2000);
  world("offset", Number, 0);
  world("autoEnable", Boolean, false);

  game.settings.registerMenu(MODULE_ID, "menu", {
    name: "DSDS.Menu.Name",
    label: "DSDS.Menu.Label",
    hint: "DSDS.Menu.Hint",
    icon: "fa-solid fa-skull",
    type: DeathScreenSettings,
    restricted: true
  });
}

/* -------------------------------------------- */
/*  Окно настроек (ApplicationV2)               */
/* -------------------------------------------- */

class DeathScreenSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "ds-death-screen-settings",
    tag: "form",
    classes: ["standard-form", "ds-death-settings-app"],
    window: { title: "DSDS.Settings.Title", icon: "fa-solid fa-skull", resizable: true },
    position: { width: 580, height: "auto" },
    form: {
      handler: DeathScreenSettings.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      addImage: DeathScreenSettings.#onAddImage,
      removeImage: DeathScreenSettings.#onRemoveImage,
      pickSound: DeathScreenSettings.#onPickSound,
      test: DeathScreenSettings.#onTest
    }
  };

  static PARTS = {
    form: { template: `${MODULE_PATH}/templates/settings.hbs`, scrollable: [".ds-death-settings"] },
    footer: { template: `${MODULE_PATH}/templates/footer.hbs` }
  };

  constructor(options = {}) {
    super(options);
    this.draft = getConfig();
  }

  async _prepareContext(options) {
    const s = this.draft;
    return {
      images: s.images.map((src) => ({ src, selected: src === s.selected })),
      modeRandom: s.mode === "random",
      sound: s.sound,
      volume: s.volume,
      fadeIn: s.fadeIn,
      hold: s.hold,
      fadeOut: s.fadeOut,
      offset: s.offset,
      autoEnable: s.autoEnable
    };
  }

  /** Считывает значения из формы в this.draft (чтобы не потерять несохранённые правки). */
  #syncFromForm() {
    if (!this.element) return;
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    const s = this.draft;
    s.mode = data.mode ?? s.mode;
    if (data.selected) s.selected = data.selected;
    s.sound = data.sound ?? s.sound;
    s.volume = Number(data.volume ?? s.volume);
    s.fadeIn = Math.max(0, Number(data.fadeIn ?? s.fadeIn) || 0);
    s.hold = Math.max(0, Number(data.hold ?? s.hold) || 0);
    s.fadeOut = Math.max(0, Number(data.fadeOut ?? s.fadeOut) || 0);
    s.offset = Number(data.offset ?? s.offset) || 0;
    s.autoEnable = !!(data.autoEnable ?? false);
  }

  static #pickFile(type, callback, current = "") {
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({ type, current, callback }).render(true);
  }

  static #onAddImage() {
    this.#syncFromForm();
    DeathScreenSettings.#pickFile("image", (path) => {
      if (!path) return;
      if (!this.draft.images.includes(path)) this.draft.images.push(path);
      if (!this.draft.selected) this.draft.selected = path;
      this.render();
    });
  }

  static #onRemoveImage(event, target) {
    this.#syncFromForm();
    const idx = Number(target.dataset.index);
    const [removed] = this.draft.images.splice(idx, 1);
    if (removed === this.draft.selected) this.draft.selected = this.draft.images[0] ?? "";
    this.render();
  }

  static #onPickSound() {
    this.#syncFromForm();
    DeathScreenSettings.#pickFile("audio", (path) => {
      if (!path) return;
      this.draft.sound = path;
      this.render();
    }, this.draft.sound);
  }

  static #onTest() {
    this.#syncFromForm();
    const image = pickImage(this.draft);
    if (!image) return ui.notifications.warn(game.i18n.localize("DSDS.Settings.NoImageWarn"));
    playLocal({ ...this.draft, image });
  }

  static async #onSubmit(event, form, formData) {
    this.#syncFromForm();
    const s = this.draft;
    const set = (k, v) => game.settings.set(MODULE_ID, k, v);
    await Promise.all([
      set("images", s.images),
      set("mode", s.mode),
      set("selected", s.selected),
      set("sound", s.sound),
      set("volume", s.volume),
      set("fadeIn", s.fadeIn),
      set("hold", s.hold),
      set("fadeOut", s.fadeOut),
      set("offset", s.offset),
      set("autoEnable", s.autoEnable)
    ]);
    if (s.autoEnable) await enableForPlayerActors();
    ui.notifications.info(game.i18n.localize("DSDS.Settings.Saved"));
  }
}

/* -------------------------------------------- */
/*  Показ экрана смерти                         */
/* -------------------------------------------- */

function pickImage(cfg) {
  const list = cfg.images ?? [];
  if (!list.length) return null;
  if (cfg.mode === "specific" && cfg.selected && list.includes(cfg.selected)) return cfg.selected;
  if (cfg.mode === "specific") return list[0];
  return list[Math.floor(Math.random() * list.length)];
}

/** Запускает картинку и звук на этом клиенте. */
function playLocal(cfg) {
  const fadeIn = Math.max(0, Number(cfg.fadeIn) || 0);
  const hold = Math.max(0, Number(cfg.hold) || 0);
  const fadeOut = Math.max(0, Number(cfg.fadeOut) || 0);
  const offset = Number(cfg.offset) || 0;

  // Картинка стартует через max(0, -offset)... см. ниже: за "ноль" берём самое раннее событие.
  const imageDelay = offset < 0 ? -offset : 0; // звук раньше -> картинку откладываем
  const soundDelay = offset > 0 ? offset : 0;  // звук позже -> откладываем звук

  if (cfg.sound) {
    setTimeout(() => {
      foundry.audio.AudioHelper.play({ src: cfg.sound, volume: Number(cfg.volume) || 0, autoplay: true, loop: false }, false);
    }, soundDelay);
  }

  if (!cfg.image) return;
  setTimeout(() => {
    const overlay = document.createElement("div");
    overlay.className = "ds-death-overlay";
    overlay.id = "ds-death-overlay";
    const img = document.createElement("img");
    img.src = cfg.image;
    overlay.append(img);
    document.getElementById("ds-death-overlay")?.remove();
    document.body.append(overlay);

    const total = fadeIn + hold + fadeOut || 1;
    const keyframes = [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: fadeIn / total },
      { opacity: 1, offset: (fadeIn + hold) / total },
      { opacity: 0, offset: 1 }
    ];
    const anim = img.animate(keyframes, { duration: total, fill: "both", easing: "linear" });
    anim.onfinish = () => overlay.remove();
    anim.oncancel = () => overlay.remove();
  }, imageDelay);
}

/** Показывает экран у всех (картинка выбирается один раз, у отправителя). */
function trigger(overrides = {}) {
  const cfg = { ...getConfig(), ...overrides };
  cfg.image = overrides.image ?? pickImage(cfg);
  if (!cfg.image) {
    ui.notifications.warn(game.i18n.localize("DSDS.Settings.NoImageWarn"));
    return;
  }
  const payload = {
    image: cfg.image, sound: cfg.sound, volume: cfg.volume,
    fadeIn: cfg.fadeIn, hold: cfg.hold, fadeOut: cfg.fadeOut, offset: cfg.offset
  };
  game.socket.emit(SOCKET, { type: "play", payload });
  playLocal(payload);
}

/* -------------------------------------------- */
/*  Определение смерти                          */
/* -------------------------------------------- */

function isEnabled(actor) {
  return !!actor?.getFlag(MODULE_ID, "enabled");
}

/** Возвращает true, если по данным системы актёр "мёртв". */
function isDead(actor) {
  if (!actor) return false;
  if (actor.statuses?.has("dead")) return true;
  const sys = actor.system ?? {};

  // dnd5e и n5eb: system.attributes.hp
  const hp = sys.attributes?.hp;
  if (hp && typeof hp.value === "number") return hp.value <= 0 && (hp.max ?? 1) > 0;

  // wod5e: system.health { max, superficial, aggravated }
  const h = sys.health;
  if (h && typeof h.max === "number" && h.max > 0
    && (typeof h.superficial === "number" || typeof h.aggravated === "number")) {
    return ((h.superficial ?? 0) + (h.aggravated ?? 0)) >= h.max;
  }

  // Прочие системы: простое поле health.value / hp.value
  if (h && typeof h.value === "number" && typeof h.max === "number" && h.max > 0) return h.value <= 0;
  if (sys.hp && typeof sys.hp.value === "number" && (sys.hp.max ?? 1) > 0) return sys.hp.value <= 0;
  return false;
}

/** Включает флаг у всех актёров, которыми владеют игроки (не мастера). Только мастер. */
async function enableForPlayerActors() {
  if (!game.user.isGM) return;
  const actors = game.actors.filter((a) => a.hasPlayerOwner && a.getFlag(MODULE_ID, "enabled") !== true);
  for (const actor of actors) await actor.setFlag(MODULE_ID, "enabled", true);
}

const lastTriggered = new Map();

function tryTrigger(actor) {
  if (!isEnabled(actor)) return;
  const key = actor.uuid;
  const now = Date.now();
  if (now - (lastTriggered.get(key) ?? 0) < COOLDOWN_MS) return; // защита от двойного срабатывания
  lastTriggered.set(key, now);
  trigger();
}

/* -------------------------------------------- */
/*  Переключатель в шапке листа                 */
/* -------------------------------------------- */

async function toggleActor(actor) {
  const next = !isEnabled(actor);
  await actor.setFlag(MODULE_ID, "enabled", next);
  ui.notifications.info(game.i18n.format(next ? "DSDS.ToggleOn" : "DSDS.ToggleOff", { name: actor.name }));
}

/* -------------------------------------------- */
/*  Хуки                                        */
/* -------------------------------------------- */

Hooks.once("init", registerSettings);

Hooks.once("ready", () => {
  game.socket.on(SOCKET, (data) => {
    if (data?.type === "play" && data.payload) playLocal(data.payload);
  });
  const api = { trigger, test: trigger, isDead, isEnabled };
  game.modules.get(MODULE_ID).api = api;
});

// Новые листы (ApplicationV2): меню «три точки»
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  const actor = app.document ?? app.actor;
  if (!(actor instanceof Actor) || !actor.isOwner) return;
  const on = isEnabled(actor);
  controls.push({
    icon: on ? "fa-solid fa-square-check" : "fa-regular fa-square",
    label: `${game.i18n.localize("DSDS.Toggle")}${on ? " ✔" : ""}`,
    action: "dsDeathScreenToggle",
    onClick: async () => {
      await toggleActor(actor);
      app.render();
    }
  });
});

// Классические листы (ApplicationV1): кнопки в шапке
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  const actor = sheet.actor ?? sheet.document;
  if (!actor?.isOwner) return;
  const on = isEnabled(actor);
  buttons.unshift({
    label: `${game.i18n.localize("DSDS.Toggle")}${on ? " ✔" : ""}`,
    class: "ds-death-screen-toggle",
    icon: on ? "fa-solid fa-square-check" : "fa-regular fa-square",
    onclick: async () => {
      await toggleActor(actor);
      sheet.render();
    }
  });
});

// Смерть по HP: запоминаем состояние до обновления и сравниваем после
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  if (userId !== game.user.id) return;
  options.dsWasDead = isDead(actor);
});

Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (userId !== game.user.id) return; // срабатывает только у того, кто сделал изменение
  if (options.dsWasDead === undefined || options.dsWasDead) return;
  if (isDead(actor)) tryTrigger(actor);
});

// Смерть по статусу «dead»
Hooks.on("createActiveEffect", (effect, options, userId) => {
  if (userId !== game.user.id) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;
  if (effect.statuses?.has("dead")) tryTrigger(actor);
});

// Автовключение для новых актёров игроков (выполняет один активный мастер)
Hooks.on("createActor", (actor, options, userId) => {
  if (!game.settings.get(MODULE_ID, "autoEnable")) return;
  if (game.user !== game.users.activeGM) return;
  if (actor.hasPlayerOwner && actor.getFlag(MODULE_ID, "enabled") !== true) actor.setFlag(MODULE_ID, "enabled", true);
});

