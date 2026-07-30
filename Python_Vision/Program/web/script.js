// ========== 语言 ==========
function t(key) { return (window.LANG_DATA && window.LANG_DATA[key]) || key; }

// ========== 全局状态 ==========
let activeProjectPath = null;
let currentFile = null;
let dirty = false;
let backupTimer = null;
let quillEditor = null;
let isRichEditor = false;

let welcomePage, editorPage, projectTabs, fileList, currentFileLabel, projectStatus, recentContainer;

// ========== 启动画面 ==========
async function startupCheck() {
    const splashStatus = document.getElementById('splash-status');
    try {
        splashStatus.textContent = '正在检查项目文件...';
        const messages = await Promise.race([
            eel.check_recent_and_clean()(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
        ]);
        if (messages && messages.length > 0) {
            alert(messages.join('\n'));
        }
        splashStatus.textContent = '加载完毕';
    } catch (e) {
        splashStatus.textContent = '部分服务未连接';
    } finally {
        setTimeout(() => {
            document.getElementById('splash-screen').style.display = 'none';
            showWelcome();
        }, 800); // 展示一小段时间
    }
}

window.onload = async () => {
    // 先获取设置，再加载语言
    const settings = await weAPI.getSettings();
    currentTheme = settings.theme;
    applyTheme(currentTheme);
    savedFontFamily = settings.fontFamily || 'Microsoft YaHei';
    savedFontSize = settings.fontSize || '16';
    applyFontSettings(savedFontFamily, savedFontSize);
    if (settings.autoSave) setupAutoSave(settings.autoSave);

    // 加载语言
    await loadLanguage(settings.language || 'zh-CN');

    createWelcomeTab();
    setupDragAndDrop();
};

// ========== 事件绑定 ==========
function bindEvents() {
    welcomePage = document.getElementById('welcome-page');
    editorPage = document.getElementById('editor-page');
    projectTabs = document.getElementById('project-tabs');
    fileList = document.getElementById('file-list');
    currentFileLabel = document.getElementById('current-file-label');
    projectStatus = document.getElementById('project-status');
    recentContainer = document.getElementById('recent-cards');

    // 标题栏窗口控制
    document.getElementById('minimize-btn')?.addEventListener('click', () => eel.minimize_window()());
    document.getElementById('maximize-btn')?.addEventListener('click', () => eel.maximize_window()());
    document.getElementById('close-window-btn')?.addEventListener('click', () => window.close());

    // 主按钮
    document.getElementById('new-project-btn')?.addEventListener('click', openNewProjectModal);
    document.getElementById('open-project-btn')?.addEventListener('click', () => openExistingProject(null));
    document.getElementById('save-file-btn')?.addEventListener('click', () => saveCurrentFile());
    document.getElementById('save-project-btn')?.addEventListener('click', saveProject);
    document.getElementById('add-file-btn')?.addEventListener('click', addNewFile);
    document.getElementById('close-project-btn')?.addEventListener('click', () => {
        if (activeProjectPath) closeProject(activeProjectPath);
    });
    document.getElementById('export-project-btn')?.addEventListener('click', exportProject);

    // 模态框
    document.getElementById('create-project-btn')?.addEventListener('click', createProjectFromModal);
    document.getElementById('cancel-project-btn')?.addEventListener('click', closeNewProjectModal);
    document.getElementById('close-modal-btn')?.addEventListener('click', closeNewProjectModal);
    document.getElementById('new-project-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'new-project-modal') closeNewProjectModal();
    });

    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (activeProjectPath && currentFile) saveCurrentFile();
        }
    });
}

// ========== 视图 ==========
function showWelcome() {
    welcomePage?.classList.add('active');
    editorPage?.classList.remove('active');
    clearInterval(backupTimer);
    loadRecentProjects();
    document.title = 'WE - World Editor';
}

function showEditor() {
    welcomePage?.classList.remove('active');
    editorPage?.classList.add('active');
    startBackupTimer();
}

// ========== 卡片加载 ==========
async function loadRecentProjects() {
    try {
        const projects = await eel.get_recent_projects_detail()();
        if (recentContainer) {
            recentContainer.innerHTML = '';
            projects.forEach(p => {
                const card = document.createElement('div');
                card.className = 'recent-card';
                const date = new Date(p.modified * 1000).toLocaleString();
                card.innerHTML = `<strong>${escapeHtml(p.name)}</strong>
                                  <div class="path">${escapeHtml(p.path)}</div>
                                  <div class="time">${date}</div>
                                  <div class="desc">${escapeHtml(p.description)}</div>`;
                card.onclick = () => openExistingProject(p.path);
                recentContainer.appendChild(card);
            });
        }
    } catch (e) { console.warn('最近项目加载失败', e); }
}

// ========== 模态框 ==========
function openNewProjectModal() {
    document.getElementById('new-project-modal').classList.add('active');
    document.getElementById('project-name').value = '';
    document.getElementById('project-desc').value = '';
    const readmeCheck = document.getElementById('init-readme');
    if (readmeCheck) readmeCheck.checked = true;
    const sampleCheck = document.getElementById('init-sample');
    if (sampleCheck) sampleCheck.checked = false;
    document.getElementById('project-name').focus();
}

function closeNewProjectModal() {
    document.getElementById('new-project-modal').classList.remove('active');
}

async function createProjectFromModal() {
    const name = document.getElementById('project-name').value.trim();
    if (!name) { alert('请输入项目名称'); return; }
    const description = document.getElementById('project-desc').value.trim();
    const initReadme = document.getElementById('init-readme').checked;
    const initSample = document.getElementById('init-sample').checked;

    const folder = await eel.get_default_project_path(name)();
    await eel.create_new_project(folder, name, description, initReadme, initSample)();
    closeNewProjectModal();
    await refreshProjects();
    showEditor();
    activateProject(folder);
}

// ========== 打开项目 ==========
async function openExistingProject(folder) {
    if (!folder) {
        folder = await eel.select_wep_file()();
        if (!folder) return;
    }
    await eel.open_existing_project(folder)();
    await refreshProjects();
    showEditor();
    activateProject(folder);
}

// ========== 项目管理 ==========
async function refreshProjects() {
    const projects = await eel.get_open_projects()();
    if (!projectTabs) return;
    projectTabs.innerHTML = '';
    projects.forEach(proj => {
        const tab = document.createElement('div');
        tab.className = 'project-tab';
        if (proj.path === activeProjectPath) tab.classList.add('active');
        tab.innerHTML = `<span>${escapeHtml(proj.name)}</span><span class="close-tab">&times;</span>`;
        tab.querySelector('span').onclick = () => activateProject(proj.path);
        tab.querySelector('.close-tab').onclick = e => { e.stopPropagation(); closeProject(proj.path); };
        projectTabs.appendChild(tab);
    });
}

async function activateProject(path) {
    if (activeProjectPath === path) return;
    if (activeProjectPath && dirty && currentFile) await saveCurrentFile(true);
    activeProjectPath = path;
    currentFile = null;
    setEditorContent('');
    if (currentFileLabel) currentFileLabel.textContent = '未打开文件';
    dirty = false; updateStatus();
    const titleName = path.split(/[\\/]/).pop() + ' - WE';
    document.title = titleName;
    const titleEl = document.getElementById('titlebar-project-name');
    if (titleEl) titleEl.textContent = titleName;
    await refreshFileList();
    await refreshProjects();
}

async function closeProject(path) {
    if (activeProjectPath === path && dirty && currentFile) {
        if (confirm('有未保存的更改，是否保存？')) await saveCurrentFile();
    }
    await eel.close_project_api(path)();
    if (activeProjectPath === path) {
        activeProjectPath = null; currentFile = null; setEditorContent('');
    }
    await refreshProjects();
    if (!activeProjectPath) showWelcome();
}

// ========== 文件操作 ==========
async function refreshFileList() {
    if (!activeProjectPath || !fileList) return;
    const files = await eel.get_file_list_api(activeProjectPath)();
    fileList.innerHTML = '';
    files.forEach(f => {
        const li = document.createElement('li');
        li.textContent = f;
        li.onclick = () => openFile(f);
        if (f === currentFile) li.classList.add('active');
        fileList.appendChild(li);
    });
}

async function openFile(filename) {
    if (!activeProjectPath) return;
    if (dirty && currentFile && currentFile !== filename) await saveCurrentFile(true);
    const content = await eel.open_file_api(activeProjectPath, filename)();
    currentFile = filename;
    setEditorContent(content);
    if (currentFileLabel) currentFileLabel.textContent = filename;
    dirty = false; updateStatus();
    await refreshFileList();
}

async function saveCurrentFile(silent = false) {
    if (!activeProjectPath || !currentFile) return;
    const content = getEditorContent();
    await eel.save_file_api(activeProjectPath, currentFile, content)();
    dirty = false; updateStatus();
    if (!silent && projectStatus) {
        projectStatus.textContent = '已保存';
        setTimeout(updateStatus, 1500);
    }
}

async function saveProject() {
    if (!activeProjectPath) return;
    if (dirty && currentFile) await saveCurrentFile(true);
    await eel.save_project_api(activeProjectPath)();
    if (projectStatus) {
        projectStatus.textContent = '项目已保存';
        setTimeout(updateStatus, 2000);
    }
}

async function addNewFile() {
    if (!activeProjectPath) return;
    const name = prompt('新文件名（含 .txt）：');
    if (!name) return;
    await eel.add_file_to_project_api(activeProjectPath, name)();
    await refreshFileList();
    await openFile(name);
}

async function exportProject() {
    if (!activeProjectPath) return;
    await eel.save_project_api(activeProjectPath)();
    alert('项目已保存');
}

// ========== 编辑器 ==========
function getEditorContent() {
    return isRichEditor && quillEditor ? quillEditor.root.innerHTML : document.getElementById('editor')?.innerHTML || '';
}
function setEditorContent(content) {
    const editorEl = document.getElementById('editor');
    if (!editorEl) return;
    if (isRichEditor && quillEditor) quillEditor.root.innerHTML = content;
    else editorEl.innerHTML = content;
}
function initRichEditor() {
    if (typeof Quill === 'undefined') return;
    quillEditor = new Quill('#editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                ['bold','italic','underline'],
                [{ 'header': 1 }, { 'header': 2 }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link','image'],
                ['clean']
            ]
        }
    });
    quillEditor.on('text-change', () => {
        if (!dirty) { dirty = true; updateStatus(); }
    });
    isRichEditor = true;
}

// ========== 状态与备份 ==========
function updateStatus() {
    if (projectStatus) projectStatus.textContent = dirty ? '已修改' : '已保存';
}
function startBackupTimer() {
    clearInterval(backupTimer);
    backupTimer = setInterval(async () => {
        await eel.trigger_backup()();
    }, 5 * 60 * 1000);
}

// ========== 辅助 ==========
function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}