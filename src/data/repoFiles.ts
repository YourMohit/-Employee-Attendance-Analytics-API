import mainPy from '../../app/main.py?raw';
import decisionsMd from '../../DECISIONS.md?raw';
import reviewMd from '../../REVIEW.md?raw';
import readmeMd from '../../README.md?raw';
import openapiYaml from '../../openapi.yaml?raw';
import dataModelMd from '../../DATA_MODEL.md?raw';
import requirementsTxt from '../../requirements.txt?raw';

export interface RepoFile {
  name: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const REPO_FILES: RepoFile[] = [
  {
    name: "main.py",
    path: "app/main.py",
    language: "python",
    description: "Production FastAPI application implementing all 12 endpoints, MongoDB indexes, lifespan setup, and R1–R10 business rules.",
    content: mainPy,
  },
  {
    name: "DECISIONS.md",
    path: "DECISIONS.md",
    language: "markdown",
    description: "Design decisions explaining indexes, punch race handling, competition ties, headcount aggregation, and 100x scalability.",
    content: decisionsMd,
  },
  {
    name: "REVIEW.md",
    path: "REVIEW.md",
    language: "markdown",
    description: "Defect analysis documenting the 10 starter traps, testing symptoms, resolutions, and non-defects.",
    content: reviewMd,
  },
  {
    name: "README.md",
    path: "README.md",
    language: "markdown",
    description: "Comprehensive project documentation, architecture overview, business rule map, and local development setup instructions.",
    content: readmeMd,
  },
  {
    name: "requirements.txt",
    path: "requirements.txt",
    language: "text",
    description: "Production dependencies pinning FastAPI, Uvicorn, PyMongo, Pydantic, and python-dotenv.",
    content: requirementsTxt,
  },
  {
    name: "openapi.yaml",
    path: "openapi.yaml",
    language: "yaml",
    description: "The official OpenAPI 3.0.3 contract specifying all endpoints, request bodies, error schemas, and parameter constraints.",
    content: openapiYaml,
  },
  {
    name: "DATA_MODEL.md",
    path: "DATA_MODEL.md",
    language: "markdown",
    description: "MongoDB collections specification, type mappings (BSON Date vs Epoch ms), and the sample document structures.",
    content: dataModelMd,
  },
];
