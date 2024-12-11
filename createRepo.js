import { Octokit } from "@octokit/rest";
import { createTokenAuth } from "@octokit/auth-token";
import fetch from "node-fetch";
const token = "";
console.log(typeof token);
console.log(token);

async function createRepositoryWithReadme(
  repoName,
  description = "",
  isPrivate = false
) {
  // Create an Octokit instance with your personal access token and fetch
  const octokit = new Octokit({
    // authStrategy: createTokenAuth,
    auth: token,
    request: {
      fetch: fetch,
    },
  });

  try {
    // Create the repository
    const { data: repo } = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: description,
      private: isPrivate,
      auto_init: false,
    });

    // Create a README.md file
    const readmeContent = `# ${repoName}

${description || "This is a new repository created via GitHub API."}

## Getting Started

Add your project documentation here.
`;

    // Encode the README content to base64
    const readmeBase64 = Buffer.from(readmeContent).toString("base64");

    // Create the README file in the repository
    await octokit.repos.createOrUpdateFileContents({
      owner: repo.owner.login,
      repo: repoName,
      path: "ReadME.md",
      message: "Initial commit: Add README",
      content: readmeBase64,
      branch: "main",
    });

    console.log(`Repository ${repoName} created successfully!`);
    return repo;
  } catch (error) {
    console.error("Error creating repository:", error.message);
    throw error;
  }
}

createRepositoryWithReadme(
  "AnotherTestingRepo",
  "A description of my project",
  false
)
  .then((repo) => console.log(repo))
  .catch((err) => console.error(err));
