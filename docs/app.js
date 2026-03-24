require.config({
    paths: { vs: 'https://unpkg.com/monaco-editor@0.44.0/min/vs' }
});

let projectFiles = [];
let currentFile = "main.tex";
let currentRepo = null;
let currentRepoInfo = null;
let editor = null;
let latexEngine = null;
let originalFileContents = {};


// -----------------------------
// SWIFTLATEX LOADER FIX
// -----------------------------

async function waitForSwiftLaTeX() {
    for (let i = 0; i < 50; i++) {
        if (window.PdfTeXEngine) {
            return window.PdfTeXEngine;
        }
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("SwiftLaTeX failed to load");
}


// -----------------------------
// GLOBAL FUNCTIONS
// -----------------------------

window.getToken = function () {
    const token = document.getElementById("github-token").value;
    return token ? { "Authorization": `Bearer ${token}` } : {};
};

window.connectRepo = function () {
    const repo = document.getElementById("repo-input").value;
    if (!repo) {
        alert("Enter repository (owner/repo)");
        return;
    }
    loadGithubRepo(repo);
};


// -----------------------------
// LATEX COMPILE
// -----------------------------

window.compile = async function () {

    const status = document.getElementById("status");
    const frame = document.getElementById("pdf-preview");

    if (!editor) return;

    try {

        if (!latexEngine) {

            status.innerText = "Loading LaTeX engine...";

            const EngineClass = await waitForSwiftLaTeX();

            latexEngine = new EngineClass();
            await latexEngine.loadEngine();
        }

        latexEngine.flushCache();

        status.innerText = "Preparing files...";

        for (const path of projectFiles) {

            let content;

            if (path === currentFile) {
                content = editor.getValue();
            } else {
                content = await fetchFileContent(path);
            }

            if (content) {
                latexEngine.writeFile(`/work/${path}`, content);
            }
        }

        status.innerText = "Compiling...";

        const result = await latexEngine.compile(editor.getValue());

        if (result.pdf) {

            const pdfBlob = new Blob([result.pdf], { type: "application/pdf" });

            const url = URL.createObjectURL(pdfBlob);

            frame.src = url;

            status.innerText = "Compile Success";

        } else {

            status.innerText = "Compile Error";
            console.error(result.log);

        }

    } catch (err) {

        console.error(err);
        status.innerText = "Engine Error";

    }
};


// -----------------------------
// FILE FETCH
// -----------------------------

async function fetchFileContent(path) {

    try {

        const headers = window.getToken();

        const url = currentRepo
            ? `https://api.github.com/repos/${currentRepo}/contents/${path}`
            : `../${path}`;

        const res = await fetch(url, {
            headers: { ...headers, "Accept": "application/vnd.github.v3.raw" }
        });

        return await res.text();

    } catch (e) {
        return null;
    }

}


// -----------------------------
// DOWNLOAD PDF
// -----------------------------

window.downloadPDF = function () {

    const frame = document.getElementById("pdf-preview");

    if (frame.src && frame.src.startsWith("blob:")) {

        const link = document.createElement("a");

        link.href = frame.src;

        link.download = "document.pdf";

        link.click();

    }

};


// -----------------------------
// SAVE TEX
// -----------------------------

window.saveTex = function () {

    if (!editor) return;

    const content = editor.getValue();

    const blob = new Blob([content], { type: "text/plain" });

    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);

    link.download = currentFile.split("/").pop();

    link.click();

};


// -----------------------------
// GITHUB API HELPER
// -----------------------------

async function githubJsonRequest(url, options, token) {

    const fullOptions = {

        ...options,

        headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            ...(options.headers || {})
        }

    };

    const resp = await fetch(url, fullOptions);

    if (!resp.ok) {

        let errorMsg = `HTTP ${resp.status}`;

        try {
            const errorJson = await resp.json();
            errorMsg = errorJson.message || errorMsg;
        } catch {
            errorMsg = await resp.text();
        }

        throw new Error(errorMsg);
    }

    return resp.json();
}


// -----------------------------
// CREATE PULL REQUEST (FIXED)
// -----------------------------

window.createPullRequest = async function () {

    const status = document.getElementById("status");

    if (!currentRepo || !currentRepoInfo) {
        alert("Connect a repository first.");
        return;
    }

    const token = document.getElementById("github-token").value;

    if (!token) {
        alert("Provide a GitHub token.");
        return;
    }

    const filePath = currentFile;

    const newContent = editor.getValue();

    const originalContent = originalFileContents[filePath];

    if (newContent === originalContent) {

        alert("No changes detected.");
        return;

    }

    try {

        status.innerText = "Creating PR...";

        const { owner, repo, default_branch, default_branch_sha } = currentRepoInfo;

        const branchName = `collabtex-${Date.now()}`;


        // CREATE BRANCH

        await githubJsonRequest(

            `https://api.github.com/repos/${owner}/${repo}/git/refs`,

            {
                method: "POST",
                body: JSON.stringify({
                    ref: `refs/heads/${branchName}`,
                    sha: default_branch_sha
                })
            },

            token
        );


        // GET BRANCH REF

        const refData = await githubJsonRequest(

            `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branchName}`,

            { method: "GET" },

            token
        );


        const commitSha = refData.object.sha;


        // GET COMMIT

        const commitData = await githubJsonRequest(

            `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`,

            { method: "GET" },

            token
        );


        const baseTreeSha = commitData.tree.sha;


        // CREATE BLOB

        const base64Content = btoa(unescape(encodeURIComponent(newContent)));

        const blob = await githubJsonRequest(

            `https://api.github.com/repos/${owner}/${repo}/git/blobs`,

            {
                method: "POST",
                body: JSON.stringify({
                    content: base64Content,
                    encoding: "base64"
                })
            },

            token
        );


        // CREATE TREE

        const tree = await githubJsonRequest(

            `https://api.github.com/repos/${owner}/${repo}/git/trees`,

            {
                method: "POST",
                body: JSON.stringify({
                    base_tree: baseTreeSha,
                    tree: [{
                        path: filePath,
                        mode: "100644",
                        type: "blob",
                        sha: blob.sha
                    }]
                })
            },

            token
        );


        // CREATE COMMIT

        const newCommit = await githubJsonRequest(

            `https://api.github.com/repos/${owner}/${repo}/git/commits`,

            {
                method: "POST",
                body: JSON.stringify({
                    message: `Update ${filePath} via Collab-TeX`,
                    tree: tree.sha,
                    parents: [commitSha]
                })
            },

            token
        );


        // UPDATE REF

        await githubJsonRequest(

            `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`,

            {
                method: "PATCH",
                body: JSON.stringify({
                    sha: newCommit.sha
                })
            },

            token
        );


        // CREATE PR

        const pr = await githubJsonRequest(

            `https://api.github.com/repos/${owner}/${repo}/pulls`,

            {
                method: "POST",
                body: JSON.stringify({
                    title: `Update ${filePath}`,
                    head: branchName,
                    base: default_branch,
                    body: "Created via Collab-TeX"
                })
            },

            token
        );


        status.innerText = "PR created";

        alert(`PR created:\n${pr.html_url}`);

    } catch (err) {

        console.error(err);

        status.innerText = "PR creation failed";

        alert(err.message);

    }

};


// -----------------------------
// MONACO EDITOR
// -----------------------------

require(['vs/editor/editor.main'], function () {

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

    editor = monaco.editor.create(document.getElementById("editor"), {

        value: "% Loading project...\n",
        language: "latex",
        theme: "vs-dark",
        automaticLayout: true

    });

    const repo = getRepoFromURL();

    if (repo) {
        loadGithubRepo(repo);
    } else {
        loadProject();
    }

});


// -----------------------------
// REPO LOADER
// -----------------------------

async function loadGithubRepo(repo) {

    currentRepo = repo;

    const status = document.getElementById("status");

    status.innerText = "Connecting...";

    const headers = window.getToken();

    try {

        const repoInfo = await fetch(`https://api.github.com/repos/${repo}`, { headers });

        const repoData = await repoInfo.json();

        const defaultBranch = repoData.default_branch;

        const [owner, repoName] = repo.split("/");

        const branch = await fetch(

            `https://api.github.com/repos/${repo}/branches/${defaultBranch}`,

            { headers }

        );

        const branchData = await branch.json();

        currentRepoInfo = {

            owner,
            repo: repoName,
            default_branch: defaultBranch,
            default_branch_sha: branchData.commit.sha

        };


        const res = await fetch(

            `https://api.github.com/repos/${repo}/git/trees/${defaultBranch}?recursive=1`,

            { headers }

        );

        const data = await res.json();

        projectFiles = data.tree
            .filter(item => item.type === "blob")
            .map(item => item.path);

        buildFileTree();

        const mainFile = projectFiles.find(f => f.endsWith("main.tex"));

        if (mainFile) {
            await openGithubFile(repo, mainFile);
        }

        status.innerText = "Ready";

    } catch (error) {

        console.error(error);

        status.innerText = "Connection Error";

    }

}


// -----------------------------
// FILE OPEN
// -----------------------------

async function openGithubFile(repo, path) {

    const text = await fetchFileContent(path);

    currentFile = path;

    monaco.editor.setModelLanguage(editor.getModel(), detectLanguage(path));

    editor.setValue(text);

    originalFileContents[path] = text;

}


// -----------------------------
// TREE VIEW
// -----------------------------

function detectLanguage(file) {

    if (file.endsWith(".tex")) return "latex";
    if (file.endsWith(".bib")) return "plaintext";
    if (file.endsWith(".md")) return "markdown";
    return "plaintext";

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

            li.onclick = () => openGithubFile(currentRepo, fullPath);

        } else {

            li.textContent = "📁 " + name;

            li.style.fontWeight = "bold";

            li.appendChild(renderTree(item.children, fullPath));

        }

        ul.appendChild(li);

    }

    return ul;

}


function buildFileTree() {

    const container = document.getElementById("file-tree");

    container.innerHTML = "";

    container.appendChild(renderTree(buildTreeStructure(projectFiles)));

}


// -----------------------------

function getRepoFromURL() {

    return new URLSearchParams(window.location.search).get("repo");

}

async function loadProject() {

    try {

        const res = await fetch("./project.json");

        const data = await res.json();

        projectFiles = data.files;

        buildFileTree();

        const main = projectFiles.find(f => f.endsWith("main.tex"));

        if (main) openFile(main);

    } catch (e) { }

}

async function openFile(path) {

    const text = await fetchFileContent(path);

    currentFile = path;

    monaco.editor.setModelLanguage(editor.getModel(), detectLanguage(path));

    editor.setValue(text);

}