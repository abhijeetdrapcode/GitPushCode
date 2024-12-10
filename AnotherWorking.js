import { Octokit } from "@octokit/rest";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ignore from "ignore";

// Create Octokit instance with explicit fetch
const octokit = new Octokit({
  authStrategy: Octokit.authTokenAuthentication,
  auth: "",
  request: {
    fetch,
  },
});

const REPO_OWNER = "abhijeet4rana";
const REPO_NAME = "LMS2";
const BRANCH = "main";

async function uploadWithSingleCommit(folderPath) {
  try {
    // Parse .gitignore
    let ig;
    try {
      const gitignorePath = path.join(folderPath, ".gitignore");
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
        ig = ignore().add(gitignoreContent);
      } else {
        ig = ignore();
      }
    } catch (error) {
      console.error("Error reading .gitignore:", error);
      ig = ignore();
    }

    // Recursive file gathering function
    function gatherFiles(dirPath, basePath = "") {
      const files = [];
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const relativePath = path.join(basePath, item);

        // Skip ignored files
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
    }

    // Gather all files
    const filesToUpload = gatherFiles(folderPath);
    console.log(`Preparing to upload ${filesToUpload.length} files`);

    // Get the current commit of the branch
    const { data: refData } = await octokit.git.getRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${BRANCH}`,
    });
    console.log("Branch reference:", refData);

    const latestCommitSha = refData.object.sha;

    // Get the base tree of the latest commit
    const { data: commitData } = await octokit.git.getCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      commit_sha: latestCommitSha,
    });
    console.log("Latest commit data:", commitData);

    const baseTreeSha = commitData.tree.sha;

    // Create blobs and tree entries
    const treeEntries = await Promise.all(
      filesToUpload.map(async (file) => {
        // Create blob for each file
        const { data: blobData } = await octokit.git.createBlob({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        });
        // console.log(`Blob created for file ${file.path}:`, blobData);

        return {
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blobData.sha,
        };
      })
    );

    // Create a new tree
    const { data: treeData } = await octokit.git.createTree({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      base_tree: baseTreeSha,
      tree: treeEntries,
    });
    console.log("New tree created:", treeData);

    // Create a commit
    const { data: commitResponse } = await octokit.git.createCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      message: `Testing commit from ${path.basename(folderPath)}`,
      tree: treeData.sha,
      parents: [latestCommitSha],
    });
    console.log("New commit created:", commitResponse);

    // Update the branch reference
    const updateRefResponse = await octokit.git.updateRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${BRANCH}`,
      sha: commitResponse.sha,
    });
    console.log("Branch updated with new commit:", updateRefResponse);

    console.log("Successfully uploaded all files in a single commit!");
  } catch (error) {
    console.error("Error during upload:", error);
    // Log more detailed error information
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response body:", await error.response.text());
    }
  }
}

// Specify the folder path to upload
const folderPath =
  "/home/acer/Downloads/NewAws/loan-management-system3443-2024-11-15-06-37-56/loan-management-system3443";
uploadWithSingleCommit(folderPath);
