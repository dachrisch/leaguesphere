# Downgrade Babel Dependencies Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve ERESOLVE conflicts by downgrading experimental Babel 8 to stable 7.x in several frontend apps.

**Architecture:** Direct modification of `package.json` files followed by verification of the dependency tree.

**Tech Stack:** npm, Babel.

---

### Task 1: Update journey_dashboard/package.json

**Files:**
- Modify: `journey_dashboard/package.json`

**Step 1: Downgrade @babel/plugin-transform-private-property-in-object**

Change `"@babel/plugin-transform-private-property-in-object": "8.0.0"` to `"@babel/plugin-transform-private-property-in-object": "7.29.7"`

**Step 2: Commit**

```bash
git add journey_dashboard/package.json
git commit -m "fix(fe): downgrade @babel/plugin-transform-private-property-in-object in journey_dashboard"
```

### Task 2: Update gameday_designer/package.json

**Files:**
- Modify: `gameday_designer/package.json`

**Step 1: Downgrade @babel/plugin-transform-private-property-in-object**

Change `"@babel/plugin-transform-private-property-in-object": "8.0.0"` to `"@babel/plugin-transform-private-property-in-object": "7.29.7"`

**Step 2: Commit**

```bash
git add gameday_designer/package.json
git commit -m "fix(fe): downgrade @babel/plugin-transform-private-property-in-object in gameday_designer"
```

### Task 3: Update passcheck/package.json

**Files:**
- Modify: `passcheck/package.json`

**Step 1: Downgrade @babel/plugin-transform-private-property-in-object**

Change `"@babel/plugin-transform-private-property-in-object": "^8.0.0"` to `"@babel/plugin-transform-private-property-in-object": "7.29.7"`

**Step 2: Commit**

```bash
git add passcheck/package.json
git commit -m "fix(fe): downgrade @babel/plugin-transform-private-property-in-object in passcheck"
```

### Task 4: Update fe_template/package.json

**Files:**
- Modify: `fe_template/package.json`

**Step 1: Downgrade Babel packages**

Change:
- `"@babel/core": "^8.0.0"` -> `"@babel/core": "^7.12.10"`
- `"@babel/preset-env": "^8.0.0"` -> `"@babel/preset-env": "^7.12.11"`
- `"@babel/preset-react": "^8.0.0"` -> `"@babel/preset-react": "^7.12.10"`
- `"babel-loader": "^10.0.0"` -> `"babel-loader": "^9.1.3"`

**Step 2: Commit**

```bash
git add fe_template/package.json
git commit -m "fix(fe): downgrade Babel 8 to stable 7.x in fe_template"
```

### Task 5: Verification

**Files:**
- Workdir: `journey_dashboard/`

**Step 1: Run npm install --package-lock-only**

Run: `npm install --package-lock-only` in `journey_dashboard`
Expected: Success without ERESOLVE conflicts.

**Step 2: Final Squash/Commit**

The user requested a specific commit message at the end: "fix(fe): downgrade experimental Babel 8 to stable 7.x"
I will squash the previous commits or just use this message if I haven't pushed yet.
Actually, I'll follow the user's specific instruction: "If successful, commit the changes with message: 'fix(fe): downgrade experimental Babel 8 to stable 7.x'"
So I'll likely do all changes and then one commit if they prefer, but the plan says frequent commits.
I'll do one commit at the end as requested by the user.

**Step 3: Commit all changes**

```bash
git add journey_dashboard/package.json gameday_designer/package.json passcheck/package.json fe_template/package.json
git commit -m "fix(fe): downgrade experimental Babel 8 to stable 7.x"
```
