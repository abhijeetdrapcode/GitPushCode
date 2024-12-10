import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ignore from "ignore";

const GITHUB_API_URL = "https://api.github.com";
const TOKEN = "";
const REPO_OWNER = "abhijeet4rana";
const REPO_NAME = "Testing";
const BASE_BRANCH = "main";
const NEW_BRANCH = "main";

async function createBranchAndPushFiles(folderPath) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };

  // Parse .gitignore
  let ig;
  try {
    const gitignorePath = path.join(folderPath, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      ig = ignore().add(gitignoreContent);
    } else {
      ig = ignore(); // Empty ignore if .gitignore not found
    }
  } catch (error) {
    console.error("Error reading .gitignore:", error);
    return;
  }

  // Get SHA of the base branch
  let baseSha;
  try {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${BASE_BRANCH}`,
      { headers }
    );

    if (response.ok) {
      const data = await response.json();
      baseSha = data.object.sha; // SHA of the latest commit
    } else {
      throw new Error(`Failed to fetch base branch: ${await response.text()}`);
    }
  } catch (error) {
    console.error("Error fetching base branch SHA:", error);
    return;
  }

  // Create a new branch
  try {
    const createBranchResponse = await fetch(
      `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/git/refs`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${NEW_BRANCH}`,
          sha: baseSha,
        }),
      }
    );

    if (createBranchResponse.ok) {
      console.log(`Branch '${NEW_BRANCH}' created successfully!`);
    } else {
      throw new Error(
        `Failed to create branch: ${await createBranchResponse.text()}`
      );
    }
  } catch (error) {
    console.error("Error creating new branch:", error);
    return;
  }

  // Function to recursively get all files in a folder while respecting .gitignore
  function getAllFiles(dirPath, folderName = "") {
    let files = [];
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const relativePath = path.join(folderName, item);

      // Skip ignored files and directories
      if (ig.ignores(relativePath)) continue;

      if (fs.statSync(fullPath).isDirectory()) {
        files = files.concat(getAllFiles(fullPath, relativePath));
      } else {
        files.push({ fullPath, relativePath });
      }
    }
    return files;
  }

  const files = getAllFiles(folderPath);

  // Push new files to the new branch
  for (const file of files) {
    const { fullPath, relativePath } = file;
    const content = fs.readFileSync(fullPath, "utf-8");
    const url = `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${relativePath}`;

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: `Add ${relativePath}`,
          content: Buffer.from(content).toString("base64"), // Encode to Base64
          branch: NEW_BRANCH, // Push to the new branch
        }),
      });

      if (response.ok) {
        console.log(`File '${relativePath}' pushed successfully!`);
      } else {
        throw new Error(`Failed to push file: ${await response.text()}`);
      }
    } catch (error) {
      console.error(`Error pushing file '${relativePath}':`, error);
    }
  }
}

// Specify the folder path to upload
const folderPath = "/home/acer/coding/agendaJs";
createBranchAndPushFiles(folderPath);
