# EpiCase — Design System v1.0

> Единый источник правды по визуальной идентичности, цветам, типографике, компонентам и UX-паттернам.
> Читать **перед** написанием любого UI-кода. Все значения — токены, никакого хардкода цветов.
> Визуальные референсы:
> - `design/EpiCase_Design_System.html` — **интерактивный референс** (открыть в браузере). Hero, палитра, компоненты в действии, граф-мок, Teacher Dashboard wireframe. **Основной референс для UI-разработки.**
> - `design/epicase-design-system.svg` — **SVG sprite** (30 symbols): 3 варианта логотипа, 6 типов узлов, 12 разделов, 9 статусов + 3 стрелочных маркера для рёбер. Источник для `client/public/branding.svg`.
> - `client/src/styles/tokens.css` — Tailwind v4 `@theme` токены для кода.

---

## 1. Бренд

### 1.1 Название и метафора

**EpiCase** = *Epi*demiological + *Case*. Платформа интерактивных учебных кейсов для подготовки врачей-эпидемиологов.

Логотип — абстрактный **ветвящийся граф из четырёх узлов**, сходящихся в общий финал. Это прямое визуальное отражение ядра продукта: сценария с несколькими путями принятия решений и единой точкой завершения. Знак читается одинаково и в иконке 16×16 (favicon), и на обложке (128+).

### 1.2 Варианты знака

| Вариант | Применение |
|---|---|
| **Primary** — градиент royal→purple, белые узлы | Основной UI, сайдбар, loading screens |
| **Monochrome dark** — на `#0F172A` | Печать, водяные знаки, экспорт PDF-отчётов |
| **Outline** — 1-цветная обводка | Служебные документы, факсы, бланки ВМедА |
| **Horizontal lockup** — знак + «EpiCase» + тагайн | TopBar, LoginPage, заголовки писем |

Знак **никогда** не растягивается несимметрично, не поворачивается и не обводится дополнительными рамками. Минимальный охранный отступ = ½ высоты узла графа (≈6 px для 48 px знака).

### 1.3 Запреты

- Нельзя менять цвета градиента (только официальные варианты)
- Нельзя заливать ноды иным цветом, кроме белого/чёрного
- Нельзя переставлять узлы (4 узла в форме ромба — фикс)
- Нельзя использовать анимированный логотип в плеере кейса, только на loading screen

---

## 2. Цветовая палитра

### 2.1 Brand tokens

| Токен | Hex | Назначение | Контрастность на белом |
|---|---|---|---|
| `--color-royal` | `#5680E9` | **Primary.** Кнопки, ссылки, активные пункты сайдбара, акцент роли *student* | 4.5:1 AA ✓ |
| `--color-sky` | `#84CEEB` | **Info.** Информационные data-узлы, фон бейджей-подсказок | 1.8:1 (только для фонов, не для текста) |
| `--color-cyan` | `#5AB9EA` | **Secondary.** Hover-состояния, вторичные графики, cyan-акцент в палитре графа | 2.6:1 (крупный текст ≥18 px) |
| `--color-lavender` | `#C1C8E4` | **Surface.** Границы, разделители, disabled-состояния, фоновые блоки | 1.5:1 (только фон) |
| `--color-purple` | `#8860D0` | **Accent.** Акцент роли *teacher/admin*, CTA «Опубликовать», финальные узлы | 4.7:1 AA ✓ |

### 2.2 Utility (semantic) tokens

| Токен | Hex | Использование |
|---|---|---|
| `--color-success` | `#10B981` | `is_correct: true` рёбра, passed attempts, success-toast |
| `--color-warning` | `#F59E0B` | partial credit, таймер истекает (< 5 мин), warning-toast |
| `--color-danger` | `#EF4444` | `is_correct: false` рёбра, error-toast, ошибка валидации, заблокированный аккаунт |
| `--color-fg` | `#0F172A` | Основной текст, тёмные иконки |
| `--color-fg-muted` | `#64748B` | Вторичный текст, подсказки, плейсхолдеры |
| `--color-bg` | `#FFFFFF` | Карточки, модалы, основные поверхности |
| `--color-surface` | `#F8FAFC` | App background, фон body |
| `--color-border` | `#E2E8F0` | Границы карточек, инпутов, тейбл-разделители |

### 2.3 Правила применения

**Ролевой акцент** (используется в сайдбаре/топбаре/аватарах):
- `student` → `royal` `#5680E9`
- `teacher` → `purple` `#8860D0`
- `admin` → `#0F172A` (slate-900) + purple-акценты

**Статусы сценария** (в карточках MyScenarios, MyCases):
- `draft` → `lavender` фон + `fg-muted` текст
- `published` → `royal` бордер + `royal` бейдж
- `archived` → `fg-muted` бейдж, приглушённая карточка

**Рёбра графа** (визуализация в конструкторе и в итоговом path):
- `is_correct: true` → `success` сплошная линия 2.5 px
- `is_correct: false` → `danger` пунктирная линия 2.5 px (dasharray: 6,4)
- `partial` (только для form/text_input) → `warning` сплошная

**Node-type раскраска** (фон узла в React Flow):
| Тип | Background | Icon color | Border |
|---|---|---|---|
| `start` | `success/10` | `success` | `success/30` |
| `data` | `sky/20` | `#1E6FA8` (dark sky) | `sky/40` |
| `decision` | `royal/10` | `royal` | `royal/30` |
| `form` | `purple/10` | `purple` | `purple/30` |
| `text_input` | `cyan/15` | `#1E8FC9` (dark cyan) | `cyan/40` |
| `final` | зависит от `result_type`: correct → `success/15`, incorrect → `danger/15`, partial → `warning/15` | соответствующий | соответствующий |

Синтаксис `color/N` означает `color-mix(in srgb, var(--color-X), transparent N%)` в Tailwind v4.

---

## 3. Типографика

### 3.1 Шрифты

**Основной:** системный стек `system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif` — не тянем веб-шрифты (офлайн-деплой, изолированная сеть ВМедА).

**Моноширинный** (код, хеши, cron-строки): `ui-monospace, "SF Mono", Menlo, Consolas, monospace`.

### 3.2 Шкала

| Токен | Размер | Line-height | Weight | Использование |
|---|---|---|---|---|
| `text-xs` | 12 px | 16 | 500 | Метки, таблицы плотные |
| `text-sm` | 14 px | 20 | 400 | Основной body-текст в интерфейсе |
| `text-base` | 16 px | 24 | 400 | Контент кейса (читаемость приоритет) |
| `text-lg` | 18 px | 26 | 500 | Заголовки карточек |
| `text-xl` | 20 px | 28 | 600 | Заголовки секций внутри страниц |
| `text-2xl` | 24 px | 32 | 700 | H2 — заголовки страниц |
| `text-3xl` | 30 px | 38 | 800 | H1 — главный заголовок дашборда |
| `text-display` | 42 px | 50 | 800 | LoginPage, welcome screens |

### 3.3 Правила
- Заголовки секций: `letter-spacing: -0.01em` для H2+
- Русский текст: не использовать `uppercase` (плохо читается), только `sentence-case`
- Цифры показателей (дашборд): `font-variant-numeric: tabular-nums` — чтобы столбцы не «прыгали»

---

## 4. Spacing и layout

### 4.1 Шкала (Tailwind v4 по умолчанию, 4-pt base)

| Токен | Px | Применение |
|---|---|---|
| `space-1` | 4 | Иконка + первый отступ текста |
| `space-2` | 8 | Inner padding кнопок |
| `space-3` | 12 | Между связанными элементами |
| `space-4` | 16 | Gap в карточках |
| `space-6` | 24 | Между независимыми секциями |
| `space-8` | 32 | Вокруг модалов |
| `space-12` | 48 | Top-margin заголовков страницы |

### 4.2 Радиусы

| Токен | Px | Где |
|---|---|---|
| `rounded-sm` | 4 | Бейджи, таблетки |
| `rounded` | 8 | Инпуты, кнопки |
| `rounded-lg` | 12 | Карточки |
| `rounded-xl` | 16 | Модалы, крупные панели |
| `rounded-full` | 9999 | Аватары, индикаторы статуса |

### 4.3 Тени

| Токен | Значение | Применение |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(15,23,42,0.04)` | Плоские карточки (default) |
| `shadow` | `0 2px 8px rgba(15,23,42,0.06)` | Hover карточек, dropdown |
| `shadow-lg` | `0 10px 30px rgba(15,23,42,0.12)` | Модалы, popovers |

### 4.4 Breakpoints

| Токен | Min-width | Цель |
|---|---|---|
| `sm` | 640 | Не используем (минимум — планшет) |
| `md` | 768 | iPad Mini, минимально поддерживаемое |
| `lg` | 1024 | Основной target — ноутбук в компьютерном классе |
| `xl` | 1280 | Рабочее место преподавателя |
| `2xl` | 1536 | Большие мониторы в админских |

**Мобильная версия явно вне MVP.** Layout оптимизирован под ≥1024 px. Для `md` — graceful degradation (сайдбар сворачивается в бургер).

---

## 5. Иконки

### 5.1 Источники

Два источника иконок:
1. **`branding.svg` sprite** (этот проект) — брендовые: логотип, 6 типов узлов, 12 разделов, 8 статусов. **Всегда предпочтительно.**
2. **`lucide-react`** — утилитарные иконки (стрелки, edit/delete/copy, chevrons, media controls). Использовать только для того, чего нет в sprite.

### 5.2 Использование sprite

```tsx
// Простое применение
<svg className="w-6 h-6 text-royal">
  <use href="/branding.svg#ico-node-decision" />
</svg>

// React-компонент-обёртка (рекомендуется):
// client/src/components/ui/Icon.tsx
type IconName =
  | "ico-node-start" | "ico-node-data" | "ico-node-decision"
  | "ico-node-form"  | "ico-node-text" | "ico-node-final"
  | "ico-dashboard" | "ico-cases" | "ico-groups" | "ico-users"
  | "ico-analytics" | "ico-attempts" | "ico-editor" | "ico-player"
  | "ico-admin" | "ico-system" | "ico-settings" | "ico-login"
  | "ico-heatmap" | "ico-check" | "ico-cross" | "ico-warn"
  | "ico-info" | "ico-download" | "ico-search" | "ico-lock" | "ico-clock";

export function Icon({ name, className = "w-5 h-5" }: { name: IconName; className?: string }) {
  return <svg className={className}><use href={`/branding.svg#${name}`} /></svg>;
}
```

### 5.3 Размеры
- `w-4 h-4` (16) — inline в тексте
- `w-5 h-5` (20) — кнопки, таблетки
- `w-6 h-6` (24) — сайдбар, тулбары (основной размер)
- `w-8 h-8` (32) — заголовки секций
- `w-12 h-12` (48) — empty-states, onboarding

### 5.4 Правила раскраски

Все иконки из sprite (кроме логотипа и статусных `ico-check/cross/warn/info`) используют `currentColor`. Раскрашиваются через `text-*` утилиты:

```tsx
<Icon name="ico-node-decision" className="w-6 h-6 text-royal" />
<Icon name="ico-admin" className="w-6 h-6 text-purple" />
```

Статусные иконки (`ico-check`, `ico-cross`, `ico-warn`, `ico-info`) имеют встроенный белый «+», их нужно красить через `text-*` родителя:

```tsx
<div className="text-success"><Icon name="ico-check" className="w-5 h-5" /></div>
```

---

## 6. Компоненты

Ниже — базовые UI-компоненты с правилами их поведения. Реализуются в `client/src/components/ui/`.

### 6.1 Button

| Variant | Цвет | Использование |
|---|---|---|
| `primary` | `bg-royal text-white hover:bg-cyan` | Основное действие на экране (один primary на форму) |
| `accent` | `bg-purple text-white hover:bg-purple/90` | Публикация, crucial CTA |
| `secondary` | `bg-white text-royal border border-royal hover:bg-royal/5` | Вторичные действия |
| `ghost` | `text-fg hover:bg-lavender/30` | Действия в тулбарах |
| `danger` | `bg-danger text-white hover:bg-danger/90` | Удалить, Заблокировать |

**Состояния (все variants):**
- `:hover` — обязательно
- `:focus-visible` — кольцо 2 px `royal/50` с offset 2 px
- `:disabled` — `opacity-50 cursor-not-allowed`
- Loading state — spinner слева, текст сохраняется, вся кнопка disabled

**Размеры:** `sm` (h-8 px-3 text-sm), `md` (h-10 px-4 text-sm), `lg` (h-12 px-6 text-base).

### 6.2 Card

```tsx
<div className="bg-bg border border-border rounded-lg shadow-sm p-6">
  <h3 className="text-lg font-semibold mb-2">…</h3>
  <p className="text-sm text-fg-muted">…</p>
</div>
```

Hover для кликабельных: `hover:shadow transition-shadow`. Активные карточки (выбранный сценарий) — добавить `ring-2 ring-royal`.

### 6.3 Badge (для статусов)

| Variant | Фон / Текст |
|---|---|
| `success` | `bg-success/10 text-success` |
| `warning` | `bg-warning/10 text-warning` |
| `danger` | `bg-danger/10 text-danger` |
| `info` | `bg-royal/10 text-royal` |
| `neutral` | `bg-lavender/40 text-fg-muted` |
| `accent` | `bg-purple/10 text-purple` |

Размер всегда `text-xs font-medium px-2.5 py-0.5 rounded-full`.

### 6.4 Input

```tsx
<input className="
  w-full h-10 px-3 text-sm
  bg-bg border border-border rounded
  focus:outline-none focus:ring-2 focus:ring-royal/40 focus:border-royal
  disabled:bg-surface disabled:text-fg-muted
  invalid:border-danger
" />
```

**Всегда** с `<label>` сверху (не placeholder-only). Ошибка — `text-xs text-danger` под полем + `aria-describedby`.

### 6.5 Modal

- Backdrop: `bg-fg/50 backdrop-blur-sm`
- Container: `bg-bg rounded-xl shadow-lg max-w-lg p-6`
- Закрытие: крестик (top-right), клик по backdrop, `Esc`
- Focus trap внутри (первый фокусируемый элемент получает фокус)
- На открытии — `document.body.style.overflow = 'hidden'`

### 6.6 Toast

Библиотека: `sonner` (лёгкая, TS-native; альтернатива `react-hot-toast`).

| Тип | Иконка | Цвет | Длительность |
|---|---|---|---|
| `success` | `ico-check` | success | 3 с |
| `error` | `ico-cross` | danger | 5 с (дольше — важно прочитать) |
| `warning` | `ico-warn` | warning | 4 с |
| `info` | `ico-info` | royal | 3 с |

Позиция: `bottom-right` на десктопе. Не перекрывать критичные CTA.

### 6.7 ConfirmDialog

**Обязателен** перед деструктивными действиями: удаление пользователя, удаление сценария, `abandon` попытки, unpublish, восстановление из бэкапа (!). Кнопка подтверждения — variant `danger`. Дефолтный фокус — на «Отмена», не на «Удалить».

### 6.8 EmptyState

Каждый список может быть пустым. Всегда показывать:

```tsx
<div className="text-center py-16">
  <Icon name="ico-cases" className="w-12 h-12 mx-auto text-fg-muted mb-4" />
  <h3 className="text-lg font-semibold">Назначенных кейсов пока нет</h3>
  <p className="text-sm text-fg-muted mt-1">
    Преподаватель назначит кейсы вашей группе — они появятся здесь.
  </p>
</div>
```

### 6.9 LoadingSpinner

Для loading состояний всегда показывать скелетон (пульсирующий placeholder) или spinner. Нельзя показывать пустой экран дольше 200 мс.

### 6.10 Table

```tsx
<table className="w-full text-sm">
  <thead>
    <tr className="border-b border-border">
      <th className="text-left font-semibold py-3 px-4 text-fg-muted">…</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-border hover:bg-surface">
      <td className="py-3 px-4">…</td>
    </tr>
  </tbody>
</table>
```

Сортировка — стрелка в header. Пагинация — если >20 строк. Чекбоксы выделения — опционально.

---

## 7. UX-паттерны

### 7.1 Loading / Empty / Error — обязательная триада

Каждый список и каждая страница обязана предусматривать три состояния:

```tsx
if (isLoading) return <Skeleton />;
if (error)     return <ErrorState error={error} retry={refetch} />;
if (!data?.length) return <EmptyState icon="…" title="…" />;
return <List data={data} />;
```

### 7.2 Обратная связь после ответа (плеер кейса)

После `POST /api/attempts/{id}/step`:
1. Инлайн-баннер над следующим узлом: `success/danger/warning` цвет + иконка + `feedback` из ответа сервера
2. Баллы показать в углу: «+8 / 10 баллов» анимированным счётчиком (framer-motion)
3. Кнопка «Далее» активна только после того, как баннер показан ≥1 с

### 7.3 Таймер попытки

- Таймер **серверный**, клиент опрашивает `GET /api/attempts/{id}/time-remaining` раз в 30 с
- Отображается всегда в топ-баре плеера
- При `< 5 мин` — цвет `warning`, пульсация раз в 2 с
- При `< 1 мин` — цвет `danger`, постоянная пульсация
- При `0` — автоматический вызов `finish`, редирект на CaseResultPage с баннером «Время истекло»

### 7.4 Автосохранение конструктора

- Debounce 30 с после последнего изменения графа → `PUT /api/scenarios/{id}/graph`
- В топ-баре индикатор: «● Сохранение…» → «✓ Сохранено в 14:32»
- При ошибке — toast `danger` + кнопка «Повторить»
- **При закрытии вкладки** с несохранёнными изменениями → native `beforeunload` dialog

### 7.5 Optimistic UI

Для быстрых операций (toggle-active, assign-to-group) используем TanStack Query `useMutation` с `onMutate` → `setQueryData` оптимистично, на ошибке — откат.

### 7.6 Клавиатура (минимум)

- `Tab` / `Shift+Tab` — вся навигация доступна с клавиатуры
- `Enter` на кнопке/ссылке — срабатывает
- `Esc` — закрывает модал/дропдаун
- В конструкторе сценариев: `Del` — удалить выбранный узел, `Ctrl+S` — явный save, `Ctrl+Z` — undo (V2)

### 7.7 Фокус

**Всегда** видимое focus-кольцо. Никакого `outline: none` без замены. Tailwind v4: `focus-visible:ring-2 focus-visible:ring-royal/50 focus-visible:ring-offset-2`.

---

## 8. Accessibility baseline

Обязательный минимум для всех страниц:

1. **Контраст** — все пары текст/фон ≥ 4.5:1 (WCAG AA) для normal text, ≥ 3:1 для ≥18 px. Проверка: `axe DevTools` при ревью.
2. **Семантика** — правильные HTML-теги (`<button>` для действий, `<a>` для навигации, `<nav>`, `<main>`, `<header>`). Никаких «кнопок» на `<div onClick>`.
3. **Label'ы** — каждый `<input>` связан с `<label for>` или имеет `aria-label`.
4. **Роли в интерактивах** — `aria-expanded`, `aria-selected`, `aria-current="page"` в навигации.
5. **Live-regions** — toast-контейнер с `aria-live="polite"`, ошибки форм — `aria-live="assertive"`.
6. **Alt** у картинок — всегда, даже если декоративная (тогда `alt=""`).
7. **Skip link** — «Перейти к основному содержимому» в начале body.
8. **Focus trap** — в модалах и дропдаунах.

---

## 9. Dark mode

**Не в MVP.** Все токены заложены через CSS variables, поэтому переключение готовится заранее. В `tokens.css`:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0F172A;
    --color-surface: #1E293B;
    --color-fg: #F8FAFC;
    --color-fg-muted: #94A3B8;
    --color-border: #334155;
    /* brand-цвета не меняются */
  }
}
```

Но в v1 CSS-запрос закомментирован — всё работает в светлой теме.

---

## 10. Tailwind v4 конфигурация

### 10.1 `client/src/styles/tokens.css`

```css
@import "tailwindcss";

@theme {
  /* Brand */
  --color-royal:     #5680E9;
  --color-sky:       #84CEEB;
  --color-cyan:      #5AB9EA;
  --color-lavender:  #C1C8E4;
  --color-purple:    #8860D0;

  /* Utility */
  --color-success:   #10B981;
  --color-warning:   #F59E0B;
  --color-danger:    #EF4444;
  --color-fg:        #0F172A;
  --color-fg-muted:  #64748B;
  --color-bg:        #FFFFFF;
  --color-surface:   #F8FAFC;
  --color-border:    #E2E8F0;

  /* Radius shortcuts (совместимо с Tailwind v4 default) */
  --radius-card:     12px;
  --radius-modal:    16px;

  /* Shadow */
  --shadow-sm:  0 1px 2px rgba(15,23,42,0.04);
  --shadow:     0 2px 8px rgba(15,23,42,0.06);
  --shadow-lg:  0 10px 30px rgba(15,23,42,0.12);
}

/* Глобальные правила */
:root { color-scheme: light; }
body { background: var(--color-surface); color: var(--color-fg); }

/* Focus ring base (применяется через utility .focus-ring) */
.focus-ring {
  outline: none;
}
.focus-ring:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-royal) 60%, transparent);
  outline-offset: 2px;
}
```

### 10.2 Подключение в `main.tsx`

```tsx
import "./styles/tokens.css";
```

### 10.3 Использование в компонентах

После этой конфигурации все классы `bg-royal`, `text-purple`, `border-danger` и т. д. работают автоматически — Tailwind v4 генерирует их из `@theme`.

---

## 11. Размещение файлов в проекте

```
epicase/
├── client/
│   ├── public/
│   │   └── branding.svg              ← копия epicase-design-system.svg (sprite)
│   └── src/
│       ├── styles/
│       │   └── tokens.css            ← см. §10.1
│       ├── components/
│       │   └── ui/
│       │       ├── Icon.tsx          ← §5.2
│       │       ├── Button.tsx        ← §6.1
│       │       ├── Card.tsx
│       │       ├── Badge.tsx
│       │       ├── Input.tsx
│       │       ├── Modal.tsx
│       │       ├── Toast.tsx         ← sonner обёртка
│       │       ├── ConfirmDialog.tsx
│       │       ├── EmptyState.tsx
│       │       ├── LoadingSpinner.tsx
│       │       ├── Table.tsx
│       │       └── Skeleton.tsx
│       └── main.tsx                  ← import "./styles/tokens.css"
└── design/
    ├── epicase-design-system.svg     ← SVG sprite (30 symbols)
    ├── EpiCase_Design_System.html     ← интерактивный референс (открыть в браузере)
    └── DESIGN_SYSTEM.md              ← этот файл
```

---

## 12. Чеклист готовности UI

Перед merge любой UI-фичи агент обязан пройти:

- [ ] Нет хардкода цветов (grep `#[0-9A-Fa-f]{6}` в `.tsx` — только в `tokens.css`)
- [ ] Все иконки через `<Icon name="…"/>` (кроме `lucide-react` для утилитарных)
- [ ] Все три состояния покрыты: Loading, Empty, Error
- [ ] Focus-visible работает (`Tab` по странице)
- [ ] Все `<input>` имеют `<label>`
- [ ] Все кнопки имеют `:hover`
- [ ] Контраст проверен в axe DevTools (0 violations)
- [ ] На разрешении 1024×768 ничего не ломается
- [ ] vitest-тесты компонента зелёные
