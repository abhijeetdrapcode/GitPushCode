import { Octokit } from "@octokit/rest";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import ignore from "ignore";

// Octokit instance with authentication
const octokit = new Octokit({
  auth: "",
  request: { fetch },
});

const REPO_OWNER = "abhijeet4rana";
const REPO_NAME = "withoutBranch";
const MAIN_BRANCH = "main";

// Generate a timestamp for branch naming
function generateTimestamp() {
  const timestamp = new Date();
  return `build-${timestamp.getFullYear()}-${String(
    timestamp.getMonth() + 1
  ).padStart(2, "0")}-${String(timestamp.getDate()).padStart(2, "0")}-${String(
    timestamp.getHours()
  ).padStart(2, "0")}-${String(timestamp.getMinutes()).padStart(2, "0")}`;
}

// Initialize an empty repository with README.md
async function initializeEmptyRepo(repoName, description) {
  try {
    console.log("Initializing empty repository...");

    const readmeContent = `# ${repoName}\n\n${
      description || "New repository created via GitHub API."
    }`;
    const readmeBase64 = Buffer.from(readmeContent).toString("base64");

    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: "ReadME.md",
      message: "Initial commit: Added README",
      content: readmeBase64,
      branch: MAIN_BRANCH,
    });
    console.log("Repository initialized with ReadME.md.");
  } catch (error) {
    console.error(
      "Failed to initialize repository:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// Gather files to upload, respecting .gitignore
async function gatherFiles(dirPath, ig, basePath = "") {
  const files = [];
  const items = await fs.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const relativePath = path.join(basePath, item.name);

    if (ig.ignores(relativePath)) continue;

    if (item.isDirectory()) {
      files.push(...(await gatherFiles(fullPath, ig, relativePath)));
    } else {
      const content = await fs.readFile(fullPath, "utf-8");
      files.push({ path: relativePath, content });
    }
  }
  return files;
}

// Upload files to a new branch
async function uploadWithNewBranch(folderPath) {
  try {
    let isRepoEmpty = false;

    try {
      await octokit.git.getRef({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        ref: `heads/${MAIN_BRANCH}`,
      });
    } catch (error) {
      if (error.status === 409) {
        isRepoEmpty = true;
      } else {
        throw error;
      }
    }

    if (isRepoEmpty) {
      await initializeEmptyRepo(REPO_NAME, "Initial repository setup");
    }

    const timestampName = generateTimestamp();

    // Load and parse .gitignore
    const gitignorePath = path.join(folderPath, ".gitignore");
    const ig = ignore();
    if (
      await fs
        .access(gitignorePath)
        .then(() => true)
        .catch(() => false)
    ) {
      const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
      ig.add(gitignoreContent);
    }

    const filesToUpload = await gatherFiles(folderPath, ig);
    console.log(`Uploading ${filesToUpload.length} files...`);

    const { data: refData } = await octokit.git.getRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${MAIN_BRANCH}`,
    });

    const latestCommitSha = refData.object.sha;

    // Create a new branch
    await octokit.git.createRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `refs/heads/${timestampName}`,
      sha: latestCommitSha,
    });

    const { data: commitData } = await octokit.git.getCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      commit_sha: latestCommitSha,
    });

    const baseTreeSha = commitData.tree.sha;

    const treeEntries = await Promise.all(
      filesToUpload.map(async (file) => {
        const { data: blobData } = await octokit.git.createBlob({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          content: file.content,
          encoding: "utf-8",
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
      base_tree: baseTreeSha,
      tree: treeEntries,
    });

    const { data: commitResponse } = await octokit.git.createCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      message: `Upload files to ${timestampName}`,
      tree: treeData.sha,
      parents: [latestCommitSha],
    });

    await octokit.git.updateRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${timestampName}`,
      sha: commitResponse.sha,
    });

    console.log(`Files uploaded to branch: ${timestampName}`);
  } catch (error) {
    console.error("Upload failed:", error.response?.data || error.message);
    throw error;
  }
}

// Usage
const folderPath =
  "/home/acer/Downloads/NewAws/loan-management-system3443-2024-11-15-06-37-56/loan-management-system3443";
uploadWithNewBranch(folderPath);
