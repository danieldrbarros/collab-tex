require.config({
    paths: { vs: 'https://unpkg.com/monaco-editor@0.44.0/min/vs' }
});

let projectFiles = [];
let currentFile = "main.tex";
let currentRepo = null;
let currentRepoInfo = null;   // { owner, repo, default_branch, default_branch_sha }
let editor = null;
let latexEngine = null;
let originalFileContents = {}; // map file path -> original content

// --- GLOBAL FUNCTIONS ---

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

window.compile = async function () {
    const status = document.getElementById("status");
    const frame = document.getElementById("pdf-preview");

    if (!editor) return;

    try {
        // Detect SwiftLaTeX engine
        let EngineClass = window.PdfTeXEngine;
        if (!EngineClass && window.SwiftLaTeX && window.SwiftLaTeX.PdfTeXEngine) {
            EngineClass = window.SwiftLaTeX.PdfTeXEngine;
        }
        if (!EngineClass) {
            alert("SwiftLaTeX engine not loaded yet.");
            return;
        }

        if (!latexEngine) {
            status.innerText = "Loading LaTeX engine...";
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

window.downloadPDF = function () {
    const frame = document.getElementById("pdf-preview");
    if (frame.src && frame.src.startsWith("blob:")) {
        const link = document.createElement("a");
        link.href = frame.src;
        link.download = "document.pdf";
        link.click();
    } else {
        window.open("../main.pdf");
    }
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

// --- CREATE PULL REQUEST ---

// Helper to encode a file path for the GitHub API (encode each segment separately)
function encodeGitHubPath(filePath) {
    return filePath.split('/').map(encodeURIComponent).join('/');
}

// Helper for GitHub API calls that expect JSON
async function githubJsonRequest(url, options, token) {
    const fullOptions = {
        ...options,
        headers: {
            ...options.headers,
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github.v3+json"
        }
    };
    console.log(`Requesting: ${url}`, fullOptions.method || 'GET');
    const resp = await fetch(url, fullOptions);
    console.log(`Response status: ${resp.status} ${resp.statusText}`);
    if (!resp.ok) {
        let errorMsg = `HTTP ${resp.status}: ${resp.statusText}`;
        try {
            const errorJson = await resp.json();
            errorMsg = errorJson.message || errorMsg;
        } catch (e) {
            // If response is not JSON, use the raw text (could be HTML)
            const text = await resp.text();
            errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
    }
    return resp.json();
}

window.createPullRequest = async function () {
    const status = document.getElementById("status");
    if (!currentRepo || !currentRepoInfo) {
        alert("Connect a GitHub repository first.");
        return;
    }

    const token = document.getElementById("github-token").value;
    if (!token) {
        alert("Please provide a GitHub token with repo scope.");
        return;
    }

    const filePath = currentFile;
    const newContent = editor.getValue();
    const originalContent = originalFileContents[filePath];

    if (newContent === originalContent) {
        alert("No changes detected. Edit the file before creating a PR.");
        return;
    }

    status.innerText = "Creating PR...";
    const { owner, repo, default_branch, default_branch_sha } = currentRepoInfo;

    // 1. Create a new branch name
    const branchName = `pr-${Date.now()}`;
    const createBranchUrl = `https://api.github.com/repos/${owner}/${repo}/git/refs`;
    const branchPayload = {
        ref: `refs/heads/${branchName}`,
        sha: default_branch_sha
    };

    try {
        // Create branch
        await githubJsonRequest(createBranchUrl, { method: "POST", body: JSON.stringify(branchPayload) }, token);

        // 2. Get the current file blob SHA from the default branch
        const encodedPath = encodeGitHubPath(filePath);
        const fileInfoUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${default_branch}`;
        const fileInfo = await githubJsonRequest(fileInfoUrl, { method: "GET" }, token);
        const oldBlobSha = fileInfo.sha;

        // 3. Create a new blob with the new content
        const createBlobUrl = `https://api.github.com/repos/${owner}/${repo}/git/blobs`;
        // Proper Unicode to base64
        const bytes = new TextEncoder().encode(newContent);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64Content = btoa(binary);
        const blobPayload = {
            content: base64Content,
            encoding: "base64"
        };
        const newBlob = await githubJsonRequest(createBlobUrl, { method: "POST", body: JSON.stringify(blobPayload) }, token);
        const newBlobSha = newBlob.sha;

        // 4. Get the current tree SHA of the branch's HEAD
        const branchCommitUrl = `https://api.github.com/repos/${owner}/${repo}/git/commits/${branchName}`;
        const branchCommit = await githubJsonRequest(branchCommitUrl, { method: "GET" }, token);
        const baseTreeSha = branchCommit.tree.sha;

        // 5. Create a new tree with the updated file
        const createTreeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees`;
        const treePayload = {
            base_tree: baseTreeSha,
            tree: [
                {
                    path: filePath,
                    mode: "100644",
                    type: "blob",
                    sha: newBlobSha
                }
            ]
        };
        const newTree = await githubJsonRequest(createTreeUrl, { method: "POST", body: JSON.stringify(treePayload) }, token);

        // 6. Create a new commit
        const createCommitUrl = `https://api.github.com/repos/${owner}/${repo}/git/commits`;
        const commitPayload = {
            message: `Update ${filePath} via Collab-TeX`,
            tree: newTree.sha,
            parents: [branchCommit.sha]
        };
        const newCommit = await githubJsonRequest(createCommitUrl, { method: "POST", body: JSON.stringify(commitPayload) }, token);

        // 7. Update the branch reference to point to the new commit
        const updateRefUrl = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`;
        await githubJsonRequest(updateRefUrl, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha, force: false }) }, token);

        // 8. Create Pull Request
        const createPRUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
        const prPayload = {
            title: `Update ${filePath}`,
            head: branchName,
            base: default_branch,
            body: "Pull request created by Collab-TeX"
        };
        const prData = await githubJsonRequest(createPRUrl, { method: "POST", body: JSON.stringify(prPayload) }, token);

        status.innerText = `PR created: ${prData.html_url}`;
        alert(`Pull request created: ${prData.html_url}`);
    } catch (err) {
        console.error(err);
        status.innerText = "PR creation failed";
        alert(`Error: ${err.message}`);
    }
};

// --- CORE LOGIC ---

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

async function loadGithubRepo(repo) {
    currentRepo = repo;
    const status = document.getElementById("status");
    status.innerText = "Connecting...";
    const headers = window.getToken();
    try {
        // Get repo info to find default branch
        const repoInfoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        const repoData = await repoInfoRes.json();
        const defaultBranch = repoData.default_branch;
        const [owner, repoName] = repo.split("/");
        currentRepoInfo = {
            owner,
            repo: repoName,
            default_branch: defaultBranch,
            default_branch_sha: null
        };

        // Get the commit SHA of the default branch
        const branchRes = await fetch(`https://api.github.com/repos/${repo}/branches/${defaultBranch}`, { headers });
        const branchData = await branchRes.json();
        currentRepoInfo.default_branch_sha = branchData.commit.sha;

        // Get all files recursively
        const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers });
        const data = await res.json();

        projectFiles = data.tree.filter(item => item.type === "blob").map(item => item.path);
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

async function openGithubFile(repo, path) {
    if (!editor) return;
    try {
        const text = await fetchFileContent(path);
        currentFile = path;
        monaco.editor.setModelLanguage(editor.getModel(), detectLanguage(path));
        editor.setValue(text);
        // Store original content for later comparison
        originalFileContents[path] = text;
    } catch (e) {
        document.getElementById("status").innerText = "Load Error";
    }
}

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
                current[part] = { __isFile: index === parts.length - 1, children: {} };
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
            li.onclick = () => currentRepo ? openGithubFile(currentRepo, fullPath) : openFile(fullPath);
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
    if (!editor) return;
    const text = await fetchFileContent(path);
    if (text) {
        currentFile = path;
        monaco.editor.setModelLanguage(editor.getModel(), detectLanguage(path));
        editor.setValue(text);
        originalFileContents[path] = text; // for local projects, this might not be used for PRs
    }
}