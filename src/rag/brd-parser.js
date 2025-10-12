// Business requirements document parser
const fs = require("fs").promises;
const path = require("path");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

class BRDParser {
  constructor() {
    this.supportedFormats = [".txt", ".md", ".docx", ".pdf", ".json"];
    this.sectionHeaders = [
      "business requirements",
      "functional requirements",
      "business rules",
      "user stories",
      "acceptance criteria",
      "business logic",
      "process flow",
      "workflow",
      "data requirements",
      "integration requirements",
    ];
  }

  async parseDocument(filePath) {
    try {
      const extension = path.extname(filePath).toLowerCase();

      if (!this.supportedFormats.includes(extension)) {
        throw new Error(`Unsupported file format: ${extension}`);
      }

      let content = "";
      let metadata = {
        source: filePath,
        filename: path.basename(filePath),
        extension: extension,
        parsed_at: new Date().toISOString(),
      };

      switch (extension) {
        case ".txt":
        case ".md":
          content = await this.parseTextFile(filePath);
          break;
        case ".docx":
          const docxResult = await this.parseDocxFile(filePath);
          content = docxResult.content;
          metadata = { ...metadata, ...docxResult.metadata };
          break;
        case ".pdf":
          const pdfResult = await this.parsePdfFile(filePath);
          content = pdfResult.content;
          metadata = { ...metadata, ...pdfResult.metadata };
          break;
        case ".json":
          const jsonResult = await this.parseJsonFile(filePath);
          content = jsonResult.content;
          metadata = { ...metadata, ...jsonResult.metadata };
          break;
      }

      // Extract structured information
      const structured = this.extractStructuredInfo(content);

      return {
        content: content,
        metadata: metadata,
        structured: structured,
        chunks: this.chunkDocument(content, structured),
      };
    } catch (error) {
      console.error(`Error parsing document ${filePath}:`, error);
      throw new Error(`Failed to parse document: ${error.message}`);
    }
  }

  async parseTextFile(filePath) {
    const content = await fs.readFile(filePath, "utf8");
    return content;
  }

  async parseDocxFile(filePath) {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });

    return {
      content: result.value,
      metadata: {
        type: "docx",
        hasImages: result.messages.some((msg) => msg.type === "image"),
        warnings: result.messages.filter((msg) => msg.type === "warning"),
      },
    };
  }

  async parsePdfFile(filePath) {
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);

    return {
      content: data.text,
      metadata: {
        type: "pdf",
        pages: data.numpages,
        info: data.info,
        version: data.version,
      },
    };
  }

  async parseJsonFile(filePath) {
    const content = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(content);

    // Extract text content from JSON
    let textContent = "";
    if (typeof data === "string") {
      textContent = data;
    } else if (data.content) {
      textContent = data.content;
    } else {
      textContent = this.extractTextFromObject(data);
    }

    return {
      content: textContent,
      metadata: {
        type: "json",
        originalStructure: data,
        hasStructuredData: true,
      },
    };
  }

  extractTextFromObject(obj, prefix = "") {
    let text = "";

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        text += `${prefix}${key}: ${value}\n`;
      } else if (Array.isArray(value)) {
        text += `${prefix}${key}:\n`;
        value.forEach((item, index) => {
          if (typeof item === "string") {
            text += `${prefix}  ${index + 1}. ${item}\n`;
          } else if (typeof item === "object") {
            text += this.extractTextFromObject(item, `${prefix}  `);
          }
        });
      } else if (typeof value === "object" && value !== null) {
        text += `${prefix}${key}:\n`;
        text += this.extractTextFromObject(value, `${prefix}  `);
      }
    }

    return text;
  }

  extractStructuredInfo(content) {
    const structured = {
      title: this.extractTitle(content),
      sections: this.extractSections(content),
      requirements: this.extractRequirements(content),
      businessRules: this.extractBusinessRules(content),
      userStories: this.extractUserStories(content),
      acceptanceCriteria: this.extractAcceptanceCriteria(content),
    };

    return structured;
  }

  extractTitle(content) {
    const lines = content.split("\n");

    // Look for title patterns
    for (const line of lines.slice(0, 10)) {
      const trimmed = line.trim();
      if (trimmed.length > 5 && trimmed.length < 100) {
        if (
          trimmed.match(/^#\s+/) || // Markdown header
          trimmed.toUpperCase() === trimmed || // All caps
          trimmed.includes("BRD") ||
          trimmed.includes("Business Requirements") ||
          trimmed.includes("Requirements Document")
        ) {
          return trimmed.replace(/^#+\s*/, "");
        }
      }
    }

    return "Untitled Document";
  }

  extractSections(content) {
    const sections = [];
    const lines = content.split("\n");
    let currentSection = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if line is a section header
      if (this.isSectionHeader(line)) {
        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          title: line.replace(/^#+\s*/, ""),
          content: "",
          startLine: i,
          type: this.classifySection(line),
        };
      } else if (currentSection && line) {
        currentSection.content += line + "\n";
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  isSectionHeader(line) {
    if (line.match(/^#+\s+/)) return true; // Markdown headers
    if (line.length < 5 || line.length > 100) return false;

    const lowerLine = line.toLowerCase();
    return this.sectionHeaders.some(
      (header) =>
        lowerLine.includes(header) ||
        lowerLine.startsWith(header.split(" ")[0]),
    );
  }

  classifySection(title) {
    const lowerTitle = title.toLowerCase();

    if (lowerTitle.includes("requirement")) return "requirements";
    if (lowerTitle.includes("business rule")) return "business_rules";
    if (lowerTitle.includes("user stor")) return "user_stories";
    if (lowerTitle.includes("acceptance")) return "acceptance_criteria";
    if (lowerTitle.includes("process") || lowerTitle.includes("workflow"))
      return "process";
    if (lowerTitle.includes("data")) return "data";
    if (lowerTitle.includes("integration")) return "integration";

    return "general";
  }

  extractRequirements(content) {
    const requirements = [];
    const patterns = [
      /(?:^|\n)\s*(?:REQ|R)[-_]?\d+[:.]\s*(.+)/gim,
      /(?:^|\n)\s*\d+\.\s*(?:The system shall|The application must|The user should)\s*(.+)/gim,
      /(?:^|\n)\s*-\s*(?:The system shall|The application must|The user should)\s*(.+)/gim,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        requirements.push({
          text: match[1].trim(),
          type: "functional",
          priority: "medium",
        });
      }
    });

    return requirements;
  }

  extractBusinessRules(content) {
    const rules = [];
    const patterns = [
      /(?:^|\n)\s*(?:BR|Rule)[-_]?\d+[:.]\s*(.+)/gim,
      /(?:^|\n)\s*Business Rule:\s*(.+)/gim,
      /(?:^|\n)\s*-\s*(?:If|When|Unless)\s+(.+)/gim,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        rules.push({
          text: match[1].trim(),
          type: "business_logic",
        });
      }
    });

    return rules;
  }

  extractUserStories(content) {
    const stories = [];
    const pattern =
      /(?:^|\n)\s*(?:As an?|As)\s+(.+?),?\s+(?:I want|I need|I would like)\s+(.+?),?\s+(?:so that|in order to|to)\s+(.+)/gim;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      stories.push({
        actor: match[1].trim(),
        action: match[2].trim(),
        benefit: match[3].trim(),
        type: "user_story",
      });
    }

    return stories;
  }

  extractAcceptanceCriteria(content) {
    const criteria = [];
    const patterns = [
      /(?:^|\n)\s*(?:AC|Acceptance Criteria?)[-_]?\d*[:.]\s*(.+)/gim,
      /(?:^|\n)\s*Given\s+(.+?),?\s+When\s+(.+?),?\s+Then\s+(.+)/gim,
    ];

    patterns.forEach((pattern, index) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (index === 0) {
          criteria.push({
            text: match[1].trim(),
            type: "acceptance_criteria",
          });
        } else {
          criteria.push({
            given: match[1].trim(),
            when: match[2].trim(),
            then: match[3].trim(),
            type: "gherkin_scenario",
          });
        }
      }
    });

    return criteria;
  }

  chunkDocument(content, structured, chunkSize = 1000, overlap = 200) {
    const chunks = [];

    // First, try to chunk by sections if available
    if (structured.sections && structured.sections.length > 0) {
      structured.sections.forEach((section, index) => {
        const sectionContent = `${section.title}\n\n${section.content}`;

        if (sectionContent.length <= chunkSize) {
          chunks.push({
            content: sectionContent,
            type: "section",
            section_title: section.title,
            section_type: section.type,
            chunk_index: chunks.length,
            metadata: { section_index: index },
          });
        } else {
          // Split large sections
          const subChunks = this.splitTextBySize(
            sectionContent,
            chunkSize,
            overlap,
          );
          subChunks.forEach((chunk, subIndex) => {
            chunks.push({
              content: chunk,
              type: "section_part",
              section_title: section.title,
              section_type: section.type,
              chunk_index: chunks.length,
              metadata: {
                section_index: index,
                sub_chunk_index: subIndex,
                total_sub_chunks: subChunks.length,
              },
            });
          });
        }
      });
    } else {
      // Fall back to simple text chunking
      const textChunks = this.splitTextBySize(content, chunkSize, overlap);
      textChunks.forEach((chunk, index) => {
        chunks.push({
          content: chunk,
          type: "text_chunk",
          chunk_index: index,
          metadata: {
            total_chunks: textChunks.length,
          },
        });
      });
    }

    return chunks;
  }

  splitTextBySize(text, chunkSize, overlap) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunk = text.substring(start, end);

      // Try to break at paragraph boundaries
      if (end < text.length) {
        const lastParagraph = chunk.lastIndexOf("\n\n");
        const lastSentence = chunk.lastIndexOf(".");

        if (lastParagraph > chunk.length * 0.7) {
          chunk = chunk.substring(0, lastParagraph);
          start = start + lastParagraph + 2 - overlap;
        } else if (lastSentence > chunk.length * 0.7) {
          chunk = chunk.substring(0, lastSentence + 1);
          start = start + lastSentence + 1 - overlap;
        } else {
          start = end - overlap;
        }
      } else {
        start = text.length;
      }

      if (chunk.trim().length > 50) {
        chunks.push(chunk.trim());
      }
    }

    return chunks;
  }
}

module.exports = new BRDParser();
