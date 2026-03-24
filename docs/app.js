require.config({
    paths: { vs: 'https://unpkg.com/monaco-editor@0.44.0/min/vs' }
});

let projectFiles = [];
let currentFile = "main.tex";
let currentRepo = null;
let editor = null;

// --- GLOBAL FUNCTIONS (Defined outside require to be available immediately) ---

window.getToken = function () {
    const token = document.getElementById("github-token").value;
    if (!token) return {};
    return {
        "Authorization": `Bearer ${token}`
    };
};

window.connectRepo = function () {
    const repo = document.getElementById("repo-input").value;
    if (!repo) {
        alert("Enter repository (owner/repo)");
        return;
    }
    loadGithubRepo(repo);
};

window.compile = function () {
    const status = document.getElementById("status");
    status.innerText = "Compiling...";
    const frame = document.getElementById("pdf-preview");
    // Cache busting to force iframe reload
    frame.src = "../main.pdf?t=" + Date.now();
    setTimeout(() => {
        status.innerText = "Ready";
    }, 800);
};

window.downloadPDF = function () {
    window.open("../main.pdf");
};

window.saveTex = function () {
    if (!editor) return;
    const content = editor.getValue();
    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = currentFile.split("/").pop();
    link.click();
};

// --- CORE LOGIC ---

require(['vs/editor/editor.main'], function () {
    console.log("Monaco loaded");

    monaco.languages.register({ id: 'latex' });
    monaco.languages.setMonarchTokensProvider('latex', {
        tokenizer: {
            root: [
                [/\\[a-zA-Z]+/, "keyword"],
                [/\$.*?\$/, "string"],
                [/%.*$/, "comment"],
                [/[{}]/, "delimiter"]
            ]
        }
    });

    editor = monaco.editor.create(
        document.getElementById("editor"),
        {
            value: "",
            language: "latex",
            theme: "vs-dark",
            automaticLayout: true
        }
    );

    const repo = getRepoFromURL();
    if (repo) {
        loadGithubRepo(repo);
    } else {
        loadProject();
    }
});

function detectLanguage(file) {
    if (file.endsWith(".tex")) return "latex";
    if (file.endsWith(".bib")) return "plaintext";
    if (file.endsWith(".md")) return "markdown";
    if (file.endsWith(".json")) return "json";
    return "plaintext";
}

async function loadProject() {
    try {
        const res = await fetch("./project.json");
        const data = await res.json();
        projectFiles = data.files;
        buildFileTree();
    } catch (e) {
        console.error("Local project.json not found", e);
    }
}

async function loadGithubRepo(repo) {
    currentRepo = repo;
    const headers = window.getToken();

    try {
        const repoInfo = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        const repoData = await repoInfo.json();
        const branch = repoData.default_branch;

        const treeURL = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
        const res = await fetch(treeURL, { headers });
        const data = await res.json();

        projectFiles = data.tree
            .filter(item => item.type === "blob")
            .map(item => item.path);

        buildFileTree();

        const mainFile = projectFiles.find(f => f.endsWith("main.tex"));
        if (mainFile) {
            openGithubFile(repo, mainFile);
        }
    } catch (error) {
        console.error("Error loading repo:", error);
        document.getElementById("status").innerText = "Error Loading Repo";
    }
}

async function openGithubFile(repo, path) {
    try {
        const headers = window.getToken();
        const repoInfo = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        const repoData = await repoInfo.json();
        const branch = repoData.default_branch;

        const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
        // Request raw content to avoid CORS issues with raw.githubusercontent.com
        const rawHeaders = { ...headers, "Accept": "application/vnd.github.v3.raw" };

        const res = await fetch(url, { headers: rawHeaders });
        if (!res.ok) throw new Error("Failed to fetch file content");

        const text = await res.text();
        currentFile = path;

        const lang = detectLanguage(path);
        monaco.editor.setModelLanguage(editor.getModel(), lang);
        editor.setValue(text);
    } catch (error) {
        console.error("Error opening file:", error);
        document.getElementById("status").innerText = "Error loading file";
    }
}

function openFile(path) {
    fetch("../" + path)
        .then(res => res.text())
        .then(text => {
            currentFile = path;
            const lang = detectLanguage(path);
            monaco.editor.setModelLanguage(editor.getModel(), lang);
            editor.setValue(text);
        });
}

function buildTreeStructure(files) {
    const root = {};
    files.forEach(path => {
        const parts = path.split("/");
        let current = root;
        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = {
                    __isFile: index === parts.length - 1,
                    children: {}
                };
            }
            current = current[part].children;
        });
    });
    return root;
}

function renderTree(node, parentPath = "") {
    const ul = document.createElement("ul");
    for (const name in node) {
        const item = node[name];
        const li = document.createElement("li");
        const fullPath = parentPath ? parentPath + "/" + name : name;

        if (item.__isFile) {
            li.textContent = "📄 " + name;
            li.onclick = () => {
                if (currentRepo) {
                    openGithubFile(currentRepo, fullPath);
                } else {
                    openFile(fullPath);
                }
            };
        } else {
            li.textContent = "📁 " + name;
            li.style.fontWeight = "bold";
            const child = renderTree(item.children, fullPath);
            li.appendChild(child);
        }
        ul.appendChild(li);
    }
    return ul;
}

function buildFileTree() {
    const container = document.getElementById("file-tree");
    container.innerHTML = "";
    const tree = buildTreeStructure(projectFiles);
    const ui = renderTree(tree);
    container.appendChild(ui);
}

function getRepoFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("repo");
}