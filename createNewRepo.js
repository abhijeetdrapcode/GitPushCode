import { Octokit } from "@octokit/rest";
import fs from "fs";
import path from "path";
import ignore from "ignore";
import fetch from "node-fetch";

const octokit = new Octokit({
  authStrategy: Octokit.authTokenAuthentication,
  auth: "",
  request: {
    fetch,
  },
});
const REPO_OWNER = "abhijeet4rana";
const REPO_NAME = "new-repo";
const MAIN_BRANCH = "main";

// Create a new repository
async function createRepository() {
  try {
    const { data } = await octokit.repos.createForAuthenticatedUser({
      name: REPO_NAME,
      private: true, // Set to false for public repositories
    });
    console.log(`Repository created: ${data.html_url}`);
  } catch (error) {
    console.error("Error creating repository:", error.message);
  }
}

// Initialize the repository with a README.md file
async function initializeRepository() {
  try {
    console.log("Initializing repository...");
    const { data: blobData } = await octokit.git.createBlob({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      content: "This is the initial README.md file.",
      encoding: "utf-8",
    });

    const { data: treeData } = await octokit.git.createTree({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      tree: [
        {
          path: "README.md",
          mode: "100644",
          type: "blob",
          sha: blobData.sha,
        },
      ],
    });

    const { data: commitData } = await octokit.git.createCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      message: "Initial commit with README.md",
      tree: treeData.sha,
      parents: [],
    });

    await octokit.git.createRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `refs/heads/${MAIN_BRANCH}`,
      sha: commitData.sha,
    });

    console.log("Repository initialized with README.md.");
  } catch (error) {
    console.error("Error initializing repository:", error.message);
  }
}

// Upload files to the repository
async function uploadFiles(folderPath) {
  try {
    const ig = ignore();
    const gitignorePath = path.join(folderPath, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      ig.add(fs.readFileSync(gitignorePath, "utf-8"));
    }

    const gatherFiles = (dirPath, basePath = "") => {
      const files = [];
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const relativePath = path.join(basePath, item);

        if (ig.ignores(relativePath)) continue;

        if (fs.statSync(fullPath).isDirectory()) {
          files.push(...gatherFiles(fullPath, relativePath));
        } else {
          files.push({
            path: relativePath,
            content: fs.readFileSync(fullPath, "utf-8"),
          });
        }
      }
      return files;
    };

    const files = gatherFiles(folderPath);
    console.log(`Found ${files.length} files to upload.`);

    const { data: refData } = await octokit.git.getRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${MAIN_BRANCH}`,
    });

    const { data: commitData } = await octokit.git.getCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      commit_sha: refData.object.sha,
    });

    const treeEntries = await Promise.all(
      files.map(async (file) => {
        const { data: blobData } = await octokit.git.createBlob({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        });
        return {
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blobData.sha,
        };
      })
    );

    const { data: treeData } = await octokit.git.createTree({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      base_tree: commitData.tree.sha,
      tree: treeEntries,
    });

    const { data: newCommit } = await octokit.git.createCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      message: "Add files",
      tree: treeData.sha,
      parents: [commitData.sha],
    });

    await octokit.git.updateRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${MAIN_BRANCH}`,
      sha: newCommit.sha,
    });

    console.log("Files uploaded successfully.");
  } catch (error) {
    console.error("Error uploading files:", error.message);
  }
}

// Run the process
(async () => {
  await createRepository();
  await initializeRepository();
  await uploadFiles("/path/to/your/folder"); // Replace with the folder containing your files
})();
