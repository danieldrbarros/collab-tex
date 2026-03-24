# Collab-TeX

A serverless, open-source alternative to web-based LaTeX editors. 

Collab-TeX runs entirely in your browser using GitHub Pages. It connects directly to your public or private GitHub repositories, allowing you to edit LaTeX documents using the powerful Monaco Editor and automatically push changes back via pull requests or commits.

## 🚀 Live Demo
Access the editor directly [here](https://danieldrbarros.github.io/collab-tex/)

## ✨ Features
* **Browser-Native:** No backend required. Everything runs via client-side JavaScript.
* **GitHub Integration:** Fetch file trees and read files directly from `owner/repo` (e.g., `ufabc-inclusive-education/ohekomboe-research`).
* **Monaco Editor:** Syntax highlighting and intelligent tokenization for `.tex`, `.bib`, and `.md` files.
* **Private Repositories:** Support for GitHub Personal Access Tokens (PAT) to work on private doctoral research or proprietary projects securely.

## 🛠️ Running Locally

To test or contribute to the project locally, you need a basic HTTP server to avoid CORS issues with ES modules and local file fetching.

1. Clone this repository:
   ```bash
   git clone [https://github.com/yourusername/collab-tex.git](https://github.com/yourusername/collab-tex.git)
   cd collab-tex/docs
   ```
2. Serve the directory using Python:
   ```bash
   python -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser.

## 🤝 Contributing
Contributions are welcome! We are currently looking for help implementing the GitHub Issues/Pull Request generation from the frontend.
