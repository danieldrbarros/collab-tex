# ✨ Collab-Tex  
_Redesigning Academic LaTeX Collaboration_

---

## 🚀 What is Collab-Tex?

**Collab-Tex** is a collaborative platform for reviewing **LaTeX documents**.  
Reviewers and authors can **edit**, **suggest improvements**, and **track PDFs in real time** — all without installing any software.

📌 Think of it as a simple, open alternative to Overleaf.

---

## 🔄 How it works

1. **Edit directly in GitHub**  
   - Click any `.tex` file → **Edit** → propose your changes.  
   - Create a **Pull Request** to submit your suggestions.

2. **Automatic PDF preview via GitHub Pages**  
   - Every change triggers a **GitHub Actions workflow** that recompiles the PDF.  
   - The updated PDF is served automatically from the `docs/` folder via **GitHub Pages**.

3. **Suggest improvements**  
   - Comment on Pull Requests or propose changes directly in `.tex` files.  
   - The PDF will update automatically after each workflow run.

---

## 📄 Preview PDF via Pages (Non-Technical Reviewers)

To make reviewing as simple as possible, we provide **direct links to the latest compiled PDF** for each branch.  
Click the link to open the PDF — no setup required.

| Branch Name       | PDF Preview Link                                      |
|------------------|------------------------------------------------------|
| `main`           | [View PDF](https://dbarros1979.github.io/collab-tex//main.pdf) |
| `draft`          | [View PDF](https://dbarros1979.github.io/collab-tex/draft.pdf) |
| `feature-x`      | [View PDF](https://dbarros1979.github.io/collab-tex//feature-x.pdf) |

> ⚠️ Tip: The PDF on Pages always reflects the **latest workflow run** for that branch.

---

## 🛠️ Repository Structure

    ```
    collab-tex/
    │── docs/               # Compiled PDFs (served by GitHub Pages)
    │── figures/            # Images used in the documents
    │── references.bib      # Bibliography file
    │── example.tex         # Example LaTeX document
    │── .github/workflows/  # Compilation workflow
    ````

---

## 👩‍💻 For Reviewers

### Non-technical Reviewers
- No installation needed.  
- Click the branch PDF links above to **review the latest document**.  
- Suggest changes via **Pull Requests** or **comments** directly on GitHub.

### Technical Reviewers (optional)
1. Clone the repository:

   ```bash
   git clone https://github.com/YOUR-USERNAME/collab-tex.git
   cd collab-tex
    ````

2. Install TeX Live (before any editor/plugin):

   ```bash
   sudo apt-get update
   sudo apt-get install texlive-full
   ```
3. Compile the PDF locally (mirrors GitHub Actions workflow):

   ```bash
   pdflatex -interaction=nonstopmode -output-directory=docs main.tex
   bibtex docs/main
   pdflatex -interaction=nonstopmode -output-directory=docs main.tex
   pdflatex -interaction=nonstopmode -output-directory=docs main.tex
   ```

---

## 📦 Local Setup (Optional)

* **TeX Live** is recommended for local compilation.
* **VSCode + LaTeX Workshop** for building and previewing PDFs locally.

> ⚠️ Tip: Install TeX Live **before** any editor/plugin to avoid compilation errors.

---

## 🤝 Contributing

* Open an **Issue** to discuss ideas.
* Submit a **Pull Request** to suggest changes.
* Every contribution counts — from fixing a typo to reorganizing sections.

---

## 🌟 Why Collab-Tex?

Science thrives in community.
Every contribution matters — whether it’s a small tweak or a major revision.

---

📍 *Maintained by [danieldrbarros](https://github.com/danieldrbarros)*
💡 Inspired by the idea of making academic review more **accessible, transparent, and collaborative**.
