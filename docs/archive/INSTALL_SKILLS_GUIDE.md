# EpiCase — Установка скиллов (пошаговая инструкция)

> Среда: Windows, PowerShell, Codex/Antigravity
> Скиллы копируются в: `epicase/.agent/skills/`
> Каждый скилл = один файл SKILL.md (или папка с SKILL.md внутри)

---

## Шаг 0. Подготовка

```powershell
# Перейди в корень проекта
cd C:\path\to\epicase

# Создай временную папку для клонирования
mkdir _skill_repos
cd _skill_repos
```

---

## Шаг 1. Клонировать 5 репозиториев

```powershell
# 1) Официальные скиллы Anthropic (frontend-design, skill-creator, webapp-testing)
git clone https://github.com/anthropics/skills.git anthropic-skills

# 2) VoltAgent мега-коллекция (1000+ скиллов, включая obra, trailofbits, sentry, etc.)
git clone https://github.com/VoltAgent/awesome-agent-skills.git voltagent

# 3) Debug skill
git clone https://github.com/AlmogBaku/debug-skill.git

# 4) VibeSec (secure coding — замена secure-code-guardian)
git clone https://github.com/BehiSecc/vibesec.git

# 5) UI/UX Pro Max
git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git
```

---

## Шаг 2. Скопировать нужные скиллы

Ниже — **15 скиллов**, отсортированных по приоритету. Для каждого указан источник и команда копирования.

### ПРИОРИТЕТ 1 — Установить СЕЙЧАС (перед началом кода)

```powershell
cd C:\path\to\epicase

# ─── 1. Test-Driven Development (TDD цикл: основа всего) ───
# Источник: VoltAgent → skills/obra → test-driven-development
copy "_skill_repos\voltagent\skills\obra\test-driven-development\SKILL.md" ".agent\skills\test-driven-development.md"

# ─── 2. Systematic Debugging (4-фазный дебаг) ───
copy "_skill_repos\voltagent\skills\obra\systematic-debugging\SKILL.md" ".agent\skills\systematic-debugging.md"

# ─── 3. Verification Before Completion ───
copy "_skill_repos\voltagent\skills\obra\verification-before-completion\SKILL.md" ".agent\skills\verification-before-completion.md"

# ─── 4. VibeSec (безопасный код: IDOR, XSS, SQLi, SSRF) ───
copy "_skill_repos\vibesec\SKILL.md" ".agent\skills\vibesec.md"

# ─── 5. Frontend Design (official Anthropic — anti-AI-slop) ───
copy "_skill_repos\anthropic-skills\skills\frontend-design\SKILL.md" ".agent\skills\frontend-design.md"

# ─── 6. Skill Creator (для создания кастомных скиллов) ───
# Это папка с подпапками — копируем всю папку
xcopy /E /I "_skill_repos\anthropic-skills\skills\skill-creator" ".agent\skills\skill-creator"
```

### ПРИОРИТЕТ 2 — Установить перед фронтендом

```powershell
# ─── 7. UI/UX Pro Max (дизайн-система, палитра, шрифты) ───
copy "_skill_repos\ui-ux-pro-max-skill\SKILL.md" ".agent\skills\ui-ux-pro-max.md"

# ─── 8. UX Heuristics (10 эвристик Нильсена) ───
# Источник: VoltAgent → skills/okaashish
copy "_skill_repos\voltagent\skills\okaashish\ux-heuristics\SKILL.md" ".agent\skills\ux-heuristics.md"

# ─── 9. Refactoring UI (аудит визуальной иерархии) ───
copy "_skill_repos\voltagent\skills\okaashish\refactoring-ui\SKILL.md" ".agent\skills\refactoring-ui.md"
```

### ПРИОРИТЕТ 3 — Установить при необходимости

```powershell
# ─── 10. Debug Skill (реальные breakpoints) ───
copy "_skill_repos\debug-skill\SKILL.md" ".agent\skills\debug-skill.md"

# ─── 11. Feature Forge (спека перед кодом) ───
copy "_skill_repos\voltagent\skills\okaashish\feature-forge\SKILL.md" ".agent\skills\feature-forge.md"

# ─── 12. The Fool (red team архитектуры) ───
copy "_skill_repos\voltagent\skills\okaashish\the-fool\SKILL.md" ".agent\skills\the-fool.md"

# ─── 13. Code Reviewer (структурированное ревью) ───
copy "_skill_repos\voltagent\skills\okaashish\code-reviewer\SKILL.md" ".agent\skills\code-reviewer.md"

# ─── 14. Sentry Code Review ───
copy "_skill_repos\voltagent\skills\getsentry\code-review\SKILL.md" ".agent\skills\sentry-code-review.md"

# ─── 15. Webapp Testing (Playwright E2E) ───
xcopy /E /I "_skill_repos\anthropic-skills\skills\webapp-testing" ".agent\skills\webapp-testing"
```

---

## Шаг 3. Проверить

```powershell
# Посмотреть что установилось
dir .agent\skills\

# Ожидаемый результат (15 файлов/папок):
# test-driven-development.md
# systematic-debugging.md
# verification-before-completion.md
# vibesec.md
# frontend-design.md
# skill-creator\          (папка)
# ui-ux-pro-max.md
# ux-heuristics.md
# refactoring-ui.md
# debug-skill.md
# feature-forge.md
# the-fool.md
# code-reviewer.md
# sentry-code-review.md
# webapp-testing\         (папка)
# README.md               (уже был)
```

---

## Шаг 4. Удалить временные репозитории

```powershell
cd C:\path\to\epicase
rmdir /S /Q _skill_repos
```

---

## Важные замечания

### Пути в VoltAgent могут отличаться

Репозиторий VoltAgent обновляется часто. Если путь `skills/obra/test-driven-development/SKILL.md` не существует, найди файл:

```powershell
# Поиск по имени
dir /S /B _skill_repos\voltagent\*test-driven*
dir /S /B _skill_repos\voltagent\*systematic-debug*
dir /S /B _skill_repos\voltagent\*vibesec*
```

### Как скилл работает в Antigravity/Codex

Агент при запуске:
1. Читает `AGENTS.md` (общие правила)
2. Читает `MEMORY.md` (где остановились)
3. Перед задачей читает релевантный `.agent/skills/*.md`

В промпте для агента указывай какой скилл использовать:

```
Реализуй server/models/user.py по §8.1.
Используй скилл: .agent/skills/test-driven-development.md
Используй скилл: .agent/skills/vibesec.md
```

### Если ты используешь Claude Code (не Codex)

Скиллы ставятся иначе — через плагины:

```bash
# В Claude Code терминале:
/plugin install anthropic-agent-skills
```

Или вручную в `.claude/skills/` вместо `.agent/skills/`.

---

## Что делает каждый скилл (краткая справка)

| # | Скилл | Когда использовать |
|---|---|---|
| 1 | **test-driven-development** | ВСЕГДА. Перед написанием любого кода. Тест → Red → Code → Green |
| 2 | **systematic-debugging** | Когда баг. 4 фазы: reproduce → isolate → fix → verify |
| 3 | **verification-before-completion** | Перед завершением задачи — чеклист что всё проверено |
| 4 | **vibesec** | ВСЕГДА при auth, формах, API. Предотвращает IDOR, XSS, SQLi, SSRF |
| 5 | **frontend-design** | При создании React-компонентов. Выбирает дизайн-направление, не "AI slop" |
| 6 | **skill-creator** | Если нужно создать свой скилл (например, epid-case-scenario для предметной области) |
| 7 | **ui-ux-pro-max** | В начале фронтенда — генерит палитру, шрифты, spacing, UX-правила |
| 8 | **ux-heuristics** | Перед релизом UI — проверка по Нильсену, severity-scored |
| 9 | **refactoring-ui** | Когда UI "выглядит не так" — аудит иерархии, теней, цвета |
| 10 | **debug-skill** | Сложный баг — breakpoints, пошаговое выполнение |
| 11 | **feature-forge** | Перед новой фичей — спека + acceptance criteria |
| 12 | **the-fool** | Перед архитектурным решением — devil's advocate, pre-mortem |
| 13 | **code-reviewer** | Перед коммитом — what's broken, risky, messy, right |
| 14 | **sentry-code-review** | Альтернативное ревью (паттерны Sentry) |
| 15 | **webapp-testing** | E2E тесты через Playwright |
