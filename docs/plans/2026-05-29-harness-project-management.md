# Hermes Desktop 项目管理 + Harness 可视化 — 实施计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
> 分 Step 1（项目基本功能）和 Step 2（Harness 状态可视化）。每个 step 内部按 bite-size 任务顺序执行。

**Goal:** 在 Hermes Desktop 中增加项目管理功能，并与 Harness-Kit 的状态文件体系关联，实现可视化的 Sprint/Feature/Decision 看板。

**Architecture:** Rust 后端负责项目 CRUD 和 `.harness/` 状态文件读取，前端 React 负责可视化展示。项目 = 关联了工作目录的容器，所有对话在项目目录下发起。

**Tech Stack:** Tauri v2 (Rust 后端) + React/TypeScript (前端) + CSS 变量主题系统

---

## Step 1：项目管理基本功能（估时 5-7 天）

项目 CRUD + 左侧导航入口 + 项目列表/详情页 + 项目内对话。

### 预检：确认现有代码结构

先跑一下现有代码的构建确认：
```bash
cd /Users/wuguirong/sourceCode/hermes-desktop
npm run build
```

### Task 1：Rust 后端 — 项目数据模型 + CRUD 命令

**Objective:** 创建 `projects.rs` 模块，定义 `Project` 结构体，实现创建/列表/获取/更新/删除命令。数据文件存储在 `~/.hermes/desktop/projects.json`。

**Files:**
- Create: `src-tauri/src/commands/projects.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`（注册命令、Session 加 project_id 字段）

**Step 1: 创建 Project 类型和 projects.rs**

写入 `src-tauri/src/commands/projects.rs`：

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri;
use home;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub directory: String,
    pub files: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ProjectsStore {
    projects: Vec<Project>,
}

fn projects_path() -> PathBuf {
    let home = home::home_dir().expect("home dir");
    let mut p = home;
    p.push(".hermes");
    p.push("desktop");
    p
}

fn store_path() -> PathBuf {
    let mut p = projects_path();
    p.push("projects.json");
    p
}

fn load_store() -> ProjectsStore {
    let path = store_path();
    if path.exists() {
        let data = std::fs::read_to_string(&path).unwrap_or_else(|_| "{\"projects\":[]}".to_string());
        serde_json::from_str(&data).unwrap_or(ProjectsStore { projects: vec![] })
    } else {
        ProjectsStore { projects: vec![] }
    }
}

fn save_store(store: &ProjectsStore) {
    let dir = projects_path();
    std::fs::create_dir_all(&dir).ok();
    let path = store_path();
    std::fs::write(&path, serde_json::to_string_pretty(store).unwrap()).ok();
}

fn gen_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let rand = format!("{:x}", rand::random::<u32>());
    format!("proj_{}_{}", ts, &rand[..6])
}

#[tauri::command]
pub fn list_projects() -> Vec<Project> {
    load_store().projects
}

#[tauri::command]
pub fn get_project(id: String) -> Option<Project> {
    let store = load_store();
    store.projects.into_iter().find(|p| p.id == id)
}

#[tauri::command]
pub fn create_project(name: String, description: String, directory: String) -> Result<Project, String> {
    let mut store = load_store();
    let now = chrono::Utc::now().to_rfc3339();
    let project = Project {
        id: gen_id(),
        name,
        description,
        directory,
        files: vec![],
        created_at: now.clone(),
        updated_at: now,
    };
    store.projects.push(project.clone());
    save_store(&store);
    Ok(project)
}

#[tauri::command]
pub fn update_project(id: String, name: String, description: String, directory: String) -> Result<Project, String> {
    let mut store = load_store();
    let now = chrono::Utc::now().to_rfc3339();
    if let Some(p) = store.projects.iter_mut().find(|p| p.id == id) {
        p.name = name;
        p.description = description;
        p.directory = directory;
        p.updated_at = now.clone();
        let result = p.clone();
        save_store(&store);
        Ok(result)
    } else {
        Err("Project not found".to_string())
    }
}

#[tauri::command]
pub fn delete_project(id: String) -> Result<(), String> {
    let mut store = load_store();
    let len = store.projects.len();
    store.projects.retain(|p| p.id != id);
    if store.projects.len() < len {
        save_store(&store);
        Ok(())
    } else {
        Err("Project not found".to_string())
    }
}
```

**Step 2: 注册命令**

修改 `src-tauri/src/commands/mod.rs`，新增一行：
```rust
pub mod projects;
```

修改 `src-tauri/src/lib.rs`，在 `.invoke_handler(tauri::generate_handler![` 数组中添加：
```
commands::projects::list_projects,
commands::projects::get_project,
commands::projects::create_project,
commands::projects::update_project,
commands::projects::delete_project,
```

同时，修改 `lib.rs` 中的 `Session` 结构体，增加可选的 `project_id: Option<String>` 字段：
```rust
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: Option<u32>,
    pub cost: Option<f64>,
    pub model: Option<String>,
    pub last_message: Option<String>,
    pub project_id: Option<String>,  // ← NEW
}
```

**Step 3: 添加依赖到 Cargo.toml**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 中确认已有：
- `serde` / `serde_json`（已有）
- `chrono`（如果无则加）
- `home`（如果无则加）
- `rand`（如果无则加，或使用已有的 uuid）

**Step 4: 验证编译**

```bash
cd src-tauri
cargo check
```

Expected: 编译通过，无错误。

**Step 5: 提交**

```bash
git add src-tauri/src/commands/projects.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add project CRUD backend commands"
```

### Task 2: 前端类型定义

**Objective:** 在 `src/types.ts` 中增加 Project 类型和 Tauri invoke 封装。

**Files:**
- Modify: `src/types.ts`

**Step 1: 添加 Project 接口**

在 `src/types.ts` 末尾添加：

```typescript
export interface Project {
  id: string;
  name: string;
  description: string;
  directory: string;
  files: string[];
  created_at: string;
  updated_at: string;
}
```

**Step 2: 提交**

```bash
git add src/types.ts
git commit -m "feat: add Project type"
```

### Task 3: NavBar 增加「项目」入口

**Objective:** 在左侧导航栏新增「项目」图标，路径为 `/projects`。

**Files:**
- Modify: `src/components/NavBar.tsx`
- Modify: `src/components/Icon.tsx`（增加 folder 图标，可选）

**Step 1: 修改 NavBar**

修改 `src/components/NavBar.tsx` 的 NAV_ITEMS：

```typescript
const NAV_ITEMS = [
  { path: "/", icon: "message", label: "对话" },
  { path: "/projects", icon: "folder", label: "项目" },
  { path: "/memory", icon: "brain", label: "记忆" },
  { path: "/dashboard", icon: "dashboard", label: "管理" },
  { path: "/settings", icon: "settings", label: "设置" },
] as const;
```

**Step 2: 添加 folder 图标**

在 `src/components/Icon.tsx` 的 `IconName` 类型中添加 `"folder"`，并添加路径：

```tsx
folder: (
  <path d="M4 5a2 2 0 0 1 2-2h3.5a2 2 0 0 1 1.7 1l.8 1.3a1 1 0 0 0 .8.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" />
),
```

**Step 3: 添加路由**

修改 `src/App.tsx` 的 `handleTitleBarAction` 中的 `open-dashboard` case 后添加 `open-projects`，并在 Routes 中添加路由。

在 `AppShell` 的 Routes 中添加：
```tsx
<Route path="/projects" element={<ProjectsPage />} />
<Route path="/projects/:id" element={<ProjectDetailPage />} />
```

**注意**: ChatPage 需要保持永久挂载。项目详情页进入路线：点击项目 → ProjectsPage → 点击卡片 → ProjectDetailPage。

由于 ChatPage 是永久挂载的，ProjectDetailPage 中需要嵌入同一个 ChatPage 组件（通过同一个状态管理）。所以 ProjectDetailPage 的设计是左侧显示此项目的会话列表，右侧复用 ChatPage 的对话区。

实际上，更简单的方案：ProjectDetailPage 渲染一个 ChatPage 实例（传入 project context props），利用 ChatPage 已有的会话管理能力，但限定到 project_id。

**Step 4: 验证**

```bash
npm run dev
```

Expected: 左侧导航显示新的「项目」图标，点击可导航到 `/projects` 页面。

**Step 5: 提交**

```bash
git add src/components/NavBar.tsx src/components/Icon.tsx src/App.tsx
git commit -m "feat: add Projects nav entry and route"
```

### Task 4: 项目列表页（ProjectsPage）

**Objective:** 创建 `/projects` 页面，展示所有项目的卡片网格，支持新建、删除项目。

**Files:**
- Create: `src/pages/ProjectsPage.tsx`
- Create: `src/components/ProjectCard.tsx`
- Modify: `src/App.tsx`（已做）

**Step 1: 创建 ProjectCard 组件**

```tsx
// src/components/ProjectCard.tsx
import { Project } from "../types";
import Icon from "./Icon";

interface Props {
  project: Project;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function ProjectCard({ project, onOpen, onDelete }: Props) {
  return (
    <div className="project-card" onClick={() => onOpen(project.id)}>
      <div className="project-card-icon">
        <Icon name="folder" size={24} />
      </div>
      <div className="project-card-body">
        <div className="project-card-title">{project.name}</div>
        {project.description && (
          <div className="project-card-desc">{project.description}</div>
        )}
        <div className="project-card-meta">
          <span className="project-card-dir" title={project.directory}>
            📁 {project.directory.length > 40
              ? "..." + project.directory.slice(-37)
              : project.directory}
          </span>
        </div>
      </div>
      <button
        className="project-card-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
        title="删除项目"
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
```

**Step 2: 创建 ProjectsPage**

```tsx
// src/pages/ProjectsPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Project } from "../types";
import ProjectCard from "../components/ProjectCard";
import CreateProjectDialog from "../components/CreateProjectDialog";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    invoke<Project[]>("list_projects")
      .then(setProjects)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (name: string, description: string, directory: string) => {
    await invoke("create_project", { name, description, directory });
    load();
    setShowCreate(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除此项目？")) return;
    await invoke("delete_project", { id });
    load();
  };

  return (
    <div className="projects-page">
      <div className="projects-header">
        <h2 className="projects-title">项目</h2>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + 新建项目
        </button>
      </div>

      {loading ? (
        <div className="projects-loading">加载中...</div>
      ) : projects.length === 0 ? (
        <div className="projects-empty">
          <div className="projects-empty-icon">📂</div>
          <div className="projects-empty-text">还没有项目</div>
          <div className="projects-empty-hint">创建一个项目来组织你的工作和对话</div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + 创建第一个项目
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={(id) => navigate(`/projects/${id}`)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateProjectDialog
          onConfirm={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
```

**Step 3: 创建 CreateProjectDialog**

```tsx
// src/components/CreateProjectDialog.tsx
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onConfirm: (name: string, description: string, directory: string) => void;
  onCancel: () => void;
}

export default function CreateProjectDialog({ onConfirm, onCancel }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [directory, setDirectory] = useState("");

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const sel = await open({ directory: true, multiple: false });
      if (sel && typeof sel === "string") setDirectory(sel);
    } catch {
      // fallback for environments without @tauri-apps/plugin-dialog
    }
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">新建项目</div>

        <label className="dialog-label">项目名称 *</label>
        <input
          className="dialog-input"
          autoFocus
          value={name}
          placeholder="例如：Hermes Desktop 开发"
          onChange={(e) => setName(e.target.value)}
        />

        <label className="dialog-label">项目描述</label>
        <textarea
          className="dialog-textarea"
          value={description}
          placeholder="简单介绍这个项目的用途..."
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="dialog-label">工作目录 *</label>
        <div className="dialog-dir-row">
          <input
            className="dialog-input"
            value={directory}
            placeholder="/Users/.../my-project"
            onChange={(e) => setDirectory(e.target.value)}
          />
          <button className="btn-secondary" onClick={handleBrowse}>浏览...</button>
        </div>

        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>取消</button>
          <button
            className="btn-primary"
            disabled={!name.trim() || !directory.trim()}
            onClick={() => onConfirm(name.trim(), description.trim(), directory.trim())}
          >
            创建项目
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: 添加 CSS 样式**

在 `src/index.css` 或相关样式文件中添加项目页的样式。使用现有的 CSS 变量体系：

```css
/* ── Projects Page ──────────────────────────────────── */

.projects-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  overflow-y: auto;
}

.projects-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.projects-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
  margin: 0;
}

.projects-loading,
.projects-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
}

.projects-empty-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.projects-empty-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--ink);
}

.projects-empty-hint {
  font-size: 13px;
  margin-bottom: 12px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

/* ── Project Card ──────────────────────────────────── */

.project-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  position: relative;
}

.project-card:hover {
  border-color: var(--accent);
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.project-card-icon {
  flex-shrink: 0;
  color: var(--accent);
  opacity: 0.7;
}

.project-card-body {
  flex: 1;
  min-width: 0;
}

.project-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 4px;
}

.project-card-desc {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.project-card-meta {
  font-size: 11px;
  color: var(--muted-soft);
}

.project-card-dir {
  font-family: var(--mono-font);
  font-size: 10px;
}

.project-card-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  padding: 4px;
  border-radius: 4px;
}

.project-card:hover .project-card-delete {
  opacity: 0.6;
}

.project-card-delete:hover {
  opacity: 1;
  background: var(--surface-hover);
}

/* ── Dialog ──────────────────────────────────── */

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: 12px;
  padding: 28px;
  width: 480px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}

.dialog-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 20px;
}

.dialog-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 6px;
  margin-top: 14px;
}

.dialog-label:first-of-type {
  margin-top: 0;
}

.dialog-input,
.dialog-textarea {
  width: 100%;
  padding: 9px 12px;
  font-size: 13px;
  border: 1px solid var(--hairline);
  border-radius: 7px;
  background: var(--input-bg);
  color: var(--ink);
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}

.dialog-input:focus,
.dialog-textarea:focus {
  border-color: var(--accent);
}

.dialog-textarea {
  resize: vertical;
  min-height: 60px;
}

.dialog-dir-row {
  display: flex;
  gap: 8px;
}

.dialog-dir-row .dialog-input {
  flex: 1;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}
```

**Step 5: 验证**

```bash
npm run dev
```

Expected: 访问 `/projects` 显示空状态页面，点击"创建第一个项目"弹出对话框。

**Step 6: 提交**

```bash
git add src/pages/ProjectsPage.tsx src/components/ProjectCard.tsx src/components/CreateProjectDialog.tsx src/index.css
git commit -m "feat: add ProjectsPage with CRUD dialog"
```

### Task 5: 项目详情页（ProjectDetailPage）

**Objective:** 创建 `/projects/:id` 页面，展示单个项目的详情和会话列表，可在项目内发起对话。

**Files:**
- Create: `src/pages/ProjectDetailPage.tsx`
- Modify: `src/App.tsx`（已做路由）
- Modify: `src/pages/ChatPage.tsx`（接收 projectContext props）

**Step 1: 创建 ProjectDetailPage**

```tsx
// src/pages/ProjectDetailPage.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Project } from "../types";
import Icon from "../components/Icon";

// 复用已有 Sidebar 和 ChatView
import Sidebar from "../components/Sidebar";
// 需要传 project context 给 ChatPage

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    invoke<Project>("get_project", { id })
      .then(setProject)
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="project-detail-loading">加载中...</div>;
  if (!project) return <div className="project-detail-error">项目不存在</div>;

  return (
    <div className="project-detail">
      <div className="project-detail-header">
        <button
          className="btn-sidebar-icon"
          onClick={() => navigate("/projects")}
          title="返回项目列表"
        >
          <Icon name="chevronRight" size={14} style={{ transform: "rotate(180deg)" }} />
        </button>
        <div className="project-detail-info">
          <div className="project-detail-name">
            <Icon name="folder" size={16} />
            {project.name}
          </div>
          <div className="project-detail-dir">{project.directory}</div>
        </div>
      </div>

      <div className="project-detail-body">
        {/* 
          这里计划：
          左侧 - Sidebar（项目内会话列表，未来做）
          右侧 - ChatPage（已有状态管理 + 流式渲染，传入 projectContext）
        */}
        <div className="project-detail-placeholder">
          <div className="projects-empty-icon">💬</div>
          <p>项目内对话即将上线</p>
          <p className="project-detail-hint">Step 2 将在这里嵌入对话界面</p>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: 提交**

```bash
git add src/pages/ProjectDetailPage.tsx
git commit -m "feat: add ProjectDetailPage skeleton"
```

### Task 6: CSS 样式补全 + 导航路由注册

**Objective:** 确保路由正确、样式完整、导航联动正确。

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/NavBar.tsx`

**Step 1: 确认 App.tsx 路由注册完整**

```tsx
// 在 AppShell 的 Routes 段确保：
{!isChat && (
  <Routes>
    <Route path="/projects" element={<ProjectsPage />} />
    <Route path="/projects/:id" element={<ProjectDetailPage />} />
    <Route path="/memory" element={<MemoryPage />} />
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    ...
  </Routes>
)}
```

**Step 2: 在 App.tsx 的 handleTitleBarAction 中添加 open-projects**

```tsx
case "open-projects":
  navigate("/projects");
  break;
```

**Step 3: 验证完整流程**

```bash
npm run dev
```

手动测试：
1. 点击导航栏「项目」图标 → 进入 `/projects`
2. 空状态正确显示
3. 点击「+ 新建项目」→ 对话框弹出
4. 填写名称+路径 → 创建成功
5. 项目卡片出现在网格中
6. 点击卡片 → 进入 `/projects/:id`
7. 返回按钮正常工作

**Step 4: 提交**

```bash
git add src/App.tsx
git commit -m "feat: complete project navigation and routing"
```

---

## Step 2：Harness 状态可视化面板（估时 5-6 天）

读取 `.harness/` 目录下的状态文件，在项目详情页展示 Sprint/Feature/Decision/Session 面板。

### Task 7：Rust 后端 — 读取 Harness 状态文件

**Objective:** 新增命令读取项目目录下的 `.harness/` 状态文件。

**Files:**
- Create: `src-tauri/src/commands/harness.rs`
- Modify: `src-tauri/src/commands/mod.rs`

**Step 1: 创建 harness.rs**

```rust
// src-tauri/src/commands/harness.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug)]
pub struct HarnessState {
    pub has_harness: bool,
    pub sprint_goal: Option<String>,
    pub features: Option<HarnessFeatures>,
    pub recent_decisions: Vec<String>,
    pub sessions: Vec<HarnessSessionEntry>,
    pub backlog: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct HarnessFeatures {
    pub total: usize,
    pub completed: usize,
    pub pending: usize,
    pub items: Vec<HarnessFeatureItem>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct HarnessFeatureItem {
    pub id: String,
    pub description: String,
    pub passes: bool,
    pub acceptance: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct HarnessSessionEntry {
    pub title: String,
    pub time: String,
}

fn harness_dir(project_dir: &str) -> PathBuf {
    let mut p = PathBuf::from(project_dir);
    p.push(".harness");
    p
}

#[tauri::command]
pub fn read_harness_state(project_dir: String) -> HarnessState {
    let dir = harness_dir(&project_dir);
    if !dir.exists() {
        return HarnessState {
            has_harness: false,
            sprint_goal: None,
            features: None,
            recent_decisions: vec![],
            sessions: vec![],
            backlog: None,
        };
    }

    // Read current-sprint.md
    let sprint_path = dir.join("state").join("current-sprint.md");
    let sprint_goal = if sprint_path.exists() {
        std::fs::read_to_string(&sprint_path).ok()
    } else {
        None
    };

    // Read features.json
    let features_path = dir.join("state").join("features.json");
    let features = features_path.exists().and_then(|_| {
        let data = std::fs::read_to_string(&features_path).ok()?;
        let parsed: serde_json::Value = serde_json::from_str(&data).ok()?;
        let features_arr = parsed.get("features")?.as_array()?;
        let items: Vec<HarnessFeatureItem> = features_arr.iter().map(|f| {
            HarnessFeatureItem {
                id: f.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                description: f.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                passes: f.get("passes").and_then(|v| v.as_bool()).unwrap_or(false),
                acceptance: f.get("acceptance").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }
        }).collect();
        let total = items.len();
        let completed = items.iter().filter(|i| i.passes).count();
        Some(HarnessFeatures {
            total,
            completed,
            pending: total - completed,
            items,
        })
    });

    // Read registry/_index.md (last 10 lines of decisions)
    let index_path = dir.join("registry").join("_index.md");
    let recent_decisions = if index_path.exists() {
        let content = std::fs::read_to_string(&index_path).unwrap_or_default();
        content.lines()
            .filter(|l| l.starts_with("- ") || l.starts_with("* "))
            .map(|l| l.to_string())
            .take(10)
            .collect()
    } else {
        vec![]
    };

    // Read sessions/ directory
    let sessions_dir = dir.join("registry").join("sessions");
    let sessions = if sessions_dir.is_dir() {
        let mut entries: Vec<HarnessSessionEntry> = vec![];
        if let Ok(read) = std::fs::read_dir(&sessions_dir) {
            for entry in read.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "md").unwrap_or(false) {
                    let title = path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("session")
                        .to_string();
                    entries.push(HarnessSessionEntry {
                        title,
                        time: "".to_string(),
                    });
                }
            }
        }
        entries.sort_by(|a, b| b.title.cmp(&a.title));
        entries.truncate(20);
        entries
    } else {
        vec![]
    };

    // Read product/backlog.md (first 30 lines)
    let backlog_path = dir.join("product").join("backlog.md");
    let backlog = if backlog_path.exists() {
        std::fs::read_to_string(&backlog_path).ok()
    } else {
        None
    };

    HarnessState {
        has_harness: true,
        sprint_goal,
        features,
        recent_decisions,
        sessions,
        backlog,
    }
}
```

**Step 2: 注册命令**

修改 `src-tauri/src/commands/mod.rs`：
```rust
pub mod harness;
```

在 `lib.rs` 的 `generate_handler` 中添加：
```rust
commands::harness::read_harness_state,
```

**Step 3: 验证编译**

```bash
cd src-tauri && cargo check
```

### Task 8: 项目详情页 — Harness 面板展示

**Objective:** 在 ProjectDetailPage 中展示 Sprint Goal / Feature Progress / Decision Timeline / Session History 面板。

**Files:**
- Modify: `src/pages/ProjectDetailPage.tsx`
- Create: `src/components/HarnessSprintPanel.tsx`
- Create: `src/components/HarnessFeaturePanel.tsx`
- Create: `src/components/HarnessDecisionPanel.tsx`
- Create: `src/components/HarnessSessionPanel.tsx`

**Step 1: 创建 Sprint Panel**

```tsx
// src/components/HarnessSprintPanel.tsx
interface Props {
  sprintGoal: string | null;
}

export default function HarnessSprintPanel({ sprintGoal }: Props) {
  const goal = sprintGoal
    ? sprintGoal
        .split('\n')
        .filter(l => !l.startsWith('---') && !l.startsWith('#'))
        .slice(0, 6)
        .join('\n')
    : null;

  return (
    <div className="harness-panel">
      <div className="harness-panel-header">
        🎯 Sprint Goal
        {sprintGoal && <button className="harness-panel-edit">编辑</button>}
      </div>
      {goal ? (
        <div className="harness-sprint-content">{goal}</div>
      ) : (
        <div className="harness-panel-empty">
          未检测到 Sprint 目标（.harness/state/current-sprint.md 不存在）
        </div>
      )}
    </div>
  );
}
```

**Step 2: 创建 Feature Panel**

```tsx
// src/components/HarnessFeaturePanel.tsx
import type { HarnessFeatures } from "../types";

interface Props {
  features: HarnessFeatures | null;
}

export default function HarnessFeaturePanel({ features }: Props) {
  if (!features || features.total === 0) {
    return (
      <div className="harness-panel">
        <div className="harness-panel-header">📋 功能进度</div>
        <div className="harness-panel-empty">未检测到功能列表</div>
      </div>
    );
  }

  const pct = features.total > 0
    ? Math.round((features.completed / features.total) * 100)
    : 0;

  return (
    <div className="harness-panel">
      <div className="harness-panel-header">
        📋 功能进度
        <span className="harness-panel-count">
          {features.completed}/{features.total} 完成
        </span>
      </div>

      <div className="harness-progress-bar">
        <div
          className="harness-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="harness-progress-label">{pct}%</div>

      <div className="harness-feature-list">
        {features.items.map((item) => (
          <div
            key={item.id}
            className={`harness-feature-item ${item.passes ? "done" : "pending"}`}
          >
            <span className="harness-feature-status">
              {item.passes ? "✅" : "⬜"}
            </span>
            <span className="harness-feature-id">{item.id}</span>
            <span className="harness-feature-desc">{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: 创建 Decision Panel**

```tsx
// src/components/HarnessDecisionPanel.tsx
interface Props {
  decisions: string[];
}

export default function HarnessDecisionPanel({ decisions }: Props) {
  return (
    <div className="harness-panel">
      <div className="harness-panel-header">
        📝 最近决策
      </div>
      {decisions.length > 0 ? (
        <div className="harness-decision-list">
          {decisions.map((d, i) => (
            <div key={i} className="harness-decision-item">{d}</div>
          ))}
        </div>
      ) : (
        <div className="harness-panel-empty">暂无决策记录</div>
      )}
    </div>
  );
}
```

**Step 4: 创建 Session Panel**

```tsx
// src/components/HarnessSessionPanel.tsx
interface Props {
  sessions: { title: string; time: string }[];
}

export default function HarnessSessionPanel({ sessions }: Props) {
  return (
    <div className="harness-panel">
      <div className="harness-panel-header">
        🕐 会话记录
      </div>
      {sessions.length > 0 ? (
        <div className="harness-session-list">
          {sessions.map((s, i) => (
            <div key={i} className="harness-session-item">
              {s.title.replace(/-/g, ' ')}
            </div>
          ))}
        </div>
      ) : (
        <div className="harness-panel-empty">暂无会话记录</div>
      )}
    </div>
  );
}
```

**Step 5: 更新 ProjectDetailPage 集成所有面板**

```tsx
// 在 ProjectDetailPage.tsx 中添加 Harness 面板
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Project } from "../types";
import Icon from "../components/Icon";
import HarnessSprintPanel from "../components/HarnessSprintPanel";
import HarnessFeaturePanel from "../components/HarnessFeaturePanel";
import HarnessDecisionPanel from "../components/HarnessDecisionPanel";
import HarnessSessionPanel from "../components/HarnessSessionPanel";

// 扩展 types.ts 需要添加的类型:
// HarnessState, HarnessFeatures, HarnessFeatureItem

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [harness, setHarness] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    invoke<Project>("get_project", { id })
      .then(async (proj) => {
        setProject(proj);
        const h = await invoke<any>("read_harness_state", { projectDir: proj.directory });
        setHarness(h);
      })
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="project-detail-loading">加载中...</div>;
  if (!project) return <div className="project-detail-error">项目不存在</div>;

  return (
    <div className="project-detail">
      <div className="project-detail-header">
        <button className="btn-sidebar-icon" onClick={() => navigate("/projects")} title="返回">
          <Icon name="chevronRight" size={14} style={{ transform: "rotate(180deg)" }} />
        </button>
        <div className="project-detail-info">
          <div className="project-detail-name">
            <Icon name="folder" size={16} />
            {project.name}
          </div>
          <div className="project-detail-dir">{project.directory}</div>
        </div>
        {harness?.has_harness && (
          <span className="harness-badge">harness</span>
        )}
      </div>

      {harness?.has_harness ? (
        <div className="harness-dashboard">
          <HarnessSprintPanel sprintGoal={harness.sprint_goal} />
          <HarnessFeaturePanel features={harness.features} />
          <HarnessDecisionPanel decisions={harness.recent_decisions} />
          <HarnessSessionPanel sessions={harness.sessions} />
        </div>
      ) : (
        <div className="harness-not-found">
          <p>此项目目录下没有 .harness/ 目录</p>
          <p className="harness-not-found-hint">
            安装 harness-kit 以启用 Sprint/Feature/Decision 可视化面板
          </p>
          <code className="harness-install-cmd">
            npm install -g harness-kit && cd {project.directory} && harness-kit
          </code>
        </div>
      )}
    </div>
  );
}
```

**Step 6: 添加 Harness 面板 CSS**

```css
/* ── Harness Dashboard ─────────────────────────────── */

.harness-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-primary);
  margin-left: 12px;
}

.harness-dashboard {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 20px 28px;
  overflow-y: auto;
  flex: 1;
}

.harness-panel {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: 10px;
  padding: 16px;
}

.harness-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--hairline);
}

.harness-panel-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
}

.harness-panel-empty {
  font-size: 12px;
  color: var(--muted-soft);
  text-align: center;
  padding: 16px 0;
}

.harness-panel-edit {
  font-size: 11px;
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
}

/* Sprint */
.harness-sprint-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink);
  white-space: pre-wrap;
}

/* Features */
.harness-progress-bar {
  height: 6px;
  background: var(--hairline);
  border-radius: 3px;
  margin-bottom: 4px;
  overflow: hidden;
}

.harness-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.3s;
}

.harness-progress-label {
  font-size: 10px;
  color: var(--muted);
  text-align: right;
  margin-bottom: 12px;
}

.harness-feature-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.harness-feature-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.4;
  padding: 4px 0;
}

.harness-feature-item.pending {
  color: var(--muted);
}

.harness-feature-item.done {
  color: var(--ink);
}

.harness-feature-status {
  flex-shrink: 0;
  font-size: 11px;
}

.harness-feature-id {
  flex-shrink: 0;
  font-family: var(--mono-font);
  font-size: 10px;
  color: var(--muted-soft);
  min-width: 70px;
}

.harness-feature-desc {
  flex: 1;
}

/* Decisions */
.harness-decision-list {
  max-height: 200px;
  overflow-y: auto;
}

.harness-decision-item {
  font-size: 12px;
  padding: 4px 0;
  color: var(--muted);
  line-height: 1.4;
}

/* Sessions */
.harness-session-list {
  max-height: 200px;
  overflow-y: auto;
}

.harness-session-item {
  font-size: 12px;
  padding: 3px 0;
  color: var(--muted);
}

/* Not found */
.harness-not-found {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--muted);
  text-align: center;
}

.harness-not-found-hint {
  font-size: 13px;
  max-width: 400px;
}

.harness-install-cmd {
  font-family: var(--mono-font);
  font-size: 12px;
  background: var(--surface);
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid var(--hairline);
  max-width: 100%;
  overflow-x: auto;
  user-select: all;
}

/* Project Detail */
.project-detail {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.project-detail-loading,
.project-detail-error {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}

.project-detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--hairline);
  background: var(--surface);
}

.project-detail-info {
  flex: 1;
  min-width: 0;
}

.project-detail-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.project-detail-dir {
  font-size: 11px;
  font-family: var(--mono-font);
  color: var(--muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-detail-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.project-detail-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
}

.project-detail-hint {
  font-size: 12px;
  color: var(--muted-soft);
}
```

**Step 7: 提交**

```bash
git add src-tauri/src/commands/harness.rs src-tauri/src/commands/mod.rs src/pages/ProjectDetailPage.tsx src/components/HarnessSprintPanel.tsx src/components/HarnessFeaturePanel.tsx src/components/HarnessDecisionPanel.tsx src/components/HarnessSessionPanel.tsx src/index.css
git commit -m "feat: add Harness state visualization panels (sprint/feature/decision/session)"
```

---

## Step 3：项目内对话深度集成（估时 3-4 天）

### Task 9: 项目内会话联动

**Objective:** 项目内的对话自动关联 project_id，工作目录设为项目目录。

**Files:**
- Modify: `src/pages/ChatPage.tsx`
- Modify: `src-tauri/src/commands/chat.rs`
- Modify: `src-tauri/src/lib.rs`

**Key Changes:**
1. ChatPage 接收可选的 `projectContext: { directory: string; projectId: string }`
2. 项目内启动 hermes 进程时，以项目目录为 cwd
3. session 创建时记录 project_id
4. 侧边栏过滤只显示该项目下的 session

### Task 10: Session 摘要自动写入

**Objective:** 对话结束后自动写入摘要到 `.harness/registry/sessions/`。

**Approach:**
1. 在 Rust 后端新增 `write_session_summary` 命令
2. 在对话结束时（流式输出完毕 + status done），自动调用此命令
3. 写入 `.harness/registry/sessions/YYYY-MM-DD-HHmmss-title.md`

### Task 11: 安装 harness-kit 引导

**Objective:** 项目中检测到没有 `.harness/` 目录时，提示安装 harness-kit。

**Approach:**
1. 在 `read_harness_state` 返回 `harness_installed: bool`
2. 修改 ProjectDetailPage，底部增加安装引导卡片
3. 提供一键安装按钮（调用 `npm install -g harness-kit && harness-kit <dir>`）

---

## 最终验收标准

| 功能 | 验收条件 |
|------|---------|
| 项目管理 | NavBar 有项目入口，可创建/列表/查看/删除项目 |
| 项目详情 | 展示项目名称、路径、Harness 状态面板 |
| Sprint 可视化 | 读取 current-sprint.md 展示 Sprint 目标 |
| Feature 可视化 | 读取 features.json 展示进度条和条目列表 |
| Decision 可视化 | 读取 _index.md 展示最近决策 |
| Session 可视化 | 读取 sessions/ 目录展示历史记录（Step 2 只读） |
| Harness 检测 | 无 .harness/ 时显示安装引导，含一键安装命令 |
| 项目内对话 | Step 2 做项目详情页 + 空壳；Step 3 做项目内对话 |

---

## 关键设计原则

1. **最小侵入**：不修改 hermes CLI 核心，只在前端和 desktop Rust 层做加法
2. **共享状态文件**：.harness/ 下的文件是谁都可以读写的——Claude Code 的 Hook 写，Hermes Desktop 读+写
3. **渐进增强**：检测到 .harness/ 才展示面板，不强迫用户安装
4. **尊重 harness-kit 的约束**：features.json 的 passes 只能 false→true，desktop 端不会修改 description
