// Document chunking and preprocessing
const embeddingService = require('./embedding-service');

class ChunkProcessor {
  constructor() {
    this.defaultChunkSize = 1000;
    this.defaultOverlap = 200;
    this.minChunkSize = 100;
    this.maxChunkSize = 2000;
  }

  async processDocumentChunks(document, options = {}) {
    try {
      const {
        chunkSize = this.defaultChunkSize,
        overlap = this.defaultOverlap,
        preserveStructure = true,
        generateEmbeddings = true
      } = options;

      // Create chunks from the document
      let chunks = [];

      if (document.chunks && preserveStructure) {
        // Use pre-existing chunks from document parser
        chunks = document.chunks.map(chunk => ({
          ...chunk,
          source_document: document.metadata.filename,
          document_type: document.metadata.type || 'unknown'
        }));
      } else {
        // Create new chunks
        chunks = this.createChunks(document.content, {
          chunkSize,
          overlap,
          metadata: document.metadata
        });
      }

      // Process and enrich chunks
      const processedChunks = await this.enrichChunks(chunks, document);

      // Generate embeddings if requested
      if (generateEmbeddings) {
        await this.generateChunkEmbeddings(processedChunks);
      }

      return {
        chunks: processedChunks,
        totalChunks: processedChunks.length,
        averageChunkSize: processedChunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / processedChunks.length,
        metadata: {
          originalDocument: document.metadata,
          processing: {
            chunkSize,
            overlap,
            preserveStructure,
            generateEmbeddings,
            processedAt: new Date().toISOString()
          }
        }
      };
    } catch (error) {
      console.error('Error processing document chunks:', error);
      throw new Error(`Failed to process chunks: ${error.message}`);
    }
  }

  createChunks(content, options = {}) {
    const {
      chunkSize = this.defaultChunkSize,
      overlap = this.defaultOverlap,
      metadata = {}
    } = options;

    const chunks = [];
    let start = 0;
    let chunkIndex = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      let chunkContent = content.substring(start, end);

      // Try to break at natural boundaries
      if (end < content.length) {
        const breakPoint = this.findNaturalBreakPoint(chunkContent);
        if (breakPoint > 0) {
          chunkContent = chunkContent.substring(0, breakPoint);
          start = start + breakPoint - overlap;
        } else {
          start = end - overlap;
        }
      } else {
        start = content.length;
      }

      // Only include chunks that meet minimum size requirements
      if (chunkContent.trim().length >= this.minChunkSize) {
        chunks.push({
          content: chunkContent.trim(),
          type: 'text_chunk',
          chunk_index: chunkIndex,
          start_position: start - chunkContent.length + overlap,
          end_position: start - overlap,
          metadata: {
            ...metadata,
            chunk_size: chunkContent.length,
            created_at: new Date().toISOString()
          }
        });
        chunkIndex++;
      }
    }

    return chunks;
  }

  findNaturalBreakPoint(text) {
    // Look for paragraph breaks first
    const paragraphBreak = text.lastIndexOf('\n\n');
    if (paragraphBreak > text.length * 0.6) {
      return paragraphBreak + 2;
    }

    // Look for sentence endings
    const sentenceBreaks = [
      text.lastIndexOf('.\n'),
      text.lastIndexOf('!\n'),
      text.lastIndexOf('?\n'),
      text.lastIndexOf('. '),
      text.lastIndexOf('! '),
      text.lastIndexOf('? ')
    ];

    const latestSentenceBreak = Math.max(...sentenceBreaks.filter(pos => pos > text.length * 0.6));
    if (latestSentenceBreak > 0) {
      return latestSentenceBreak + (text[latestSentenceBreak + 1] === '\n' ? 2 : 1);
    }

    // Look for line breaks
    const lineBreak = text.lastIndexOf('\n');
    if (lineBreak > text.length * 0.7) {
      return lineBreak + 1;
    }

    // Look for word boundaries
    const wordBreak = text.lastIndexOf(' ');
    if (wordBreak > text.length * 0.8) {
      return wordBreak + 1;
    }

    return -1; // No good break point found
  }

  async enrichChunks(chunks, document) {
    return Promise.all(chunks.map(async (chunk, index) => {
      const enriched = {
        ...chunk,
        id: this.generateChunkId(document, index),
        keywords: this.extractKeywords(chunk.content),
        entities: this.extractEntities(chunk.content),
        readability: this.calculateReadability(chunk.content),
        language: this.detectLanguage(chunk.content),
        structure: this.analyzeStructure(chunk.content),
        metadata: {
          ...chunk.metadata,
          enriched_at: new Date().toISOString(),
          enrichment_version: '1.0'
        }
      };

      return enriched;
    }));
  }

  generateChunkId(document, index) {
    const filename = document.metadata.filename || 'unknown';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${filename}_${timestamp}_chunk_${index}`;
  }

  extractKeywords(text, maxKeywords = 10) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'throughout', 'despite',
      'towards', 'upon', 'concerning', 'under', 'within', 'without', 'regarding'
    ]);

    const frequency = {};
    words.forEach(word => {
      if (!stopWords.has(word)) {
        frequency[word] = (frequency[word] || 0) + 1;
      }
    });

    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, maxKeywords)
      .map(([word, count]) => ({ word, frequency: count }));
  }

  extractEntities(text) {
    const entities = {
      emails: this.extractPattern(text, /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g),
      phones: this.extractPattern(text, /\b\d{3}-\d{3}-\d{4}\b|\b\(\d{3}\)\s*\d{3}-\d{4}\b/g),
      dates: this.extractPattern(text, /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g),
      numbers: this.extractPattern(text, /\b\d+(?:\.\d+)?\b/g),
      currencies: this.extractPattern(text, /\$\d+(?:\.\d{2})?/g),
      urls: this.extractPattern(text, /https?:\/\/[^\s]+/g)
    };

    // Remove empty arrays
    Object.keys(entities).forEach(key => {
      if (entities[key].length === 0) {
        delete entities[key];
      }
    });

    return entities;
  }

  extractPattern(text, pattern) {
    const matches = text.match(pattern);
    return matches ? [...new Set(matches)] : [];
  }

  calculateReadability(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const characters = text.replace(/\s/g, '').length;

    if (sentences.length === 0 || words.length === 0) {
      return { score: 0, level: 'unknown' };
    }

    // Simple readability score based on sentence and word length
    const avgWordsPerSentence = words.length / sentences.length;
    const avgCharsPerWord = characters / words.length;

    const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgCharsPerWord / 100);

    let level;
    if (score >= 90) level = 'very_easy';
    else if (score >= 80) level = 'easy';
    else if (score >= 70) level = 'fairly_easy';
    else if (score >= 60) level = 'standard';
    else if (score >= 50) level = 'fairly_difficult';
    else if (score >= 30) level = 'difficult';
    else level = 'very_difficult';

    return {
      score: Math.max(0, Math.min(100, score)),
      level,
      avgWordsPerSentence,
      avgCharsPerWord
    };
  }

  detectLanguage(text) {
    // Simple language detection based on common words
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
    const words = text.toLowerCase().split(/\s+/);

    const englishCount = words.filter(word => englishWords.includes(word)).length;
    const englishRatio = englishCount / Math.min(words.length, 100);

    return {
      detected: englishRatio > 0.1 ? 'en' : 'unknown',
      confidence: englishRatio,
      method: 'keyword_analysis'
    };
  }

  analyzeStructure(text) {
    const lines = text.split('\n');
    const structure = {
      lineCount: lines.length,
      hasHeaders: /^#+\s/.test(text),
      hasBulletPoints: /^\s*[-*•]\s/.test(text),
      hasNumbers: /^\s*\d+\.\s/.test(text),
      hasCode: /```/.test(text) || /`[^`]+`/.test(text),
      hasTables: /\|/.test(text),
      paragraphCount: text.split(/\n\s*\n/).length,
      avgLineLength: lines.reduce((sum, line) => sum + line.length, 0) / lines.length
    };

    return structure;
  }

  async generateChunkEmbeddings(chunks) {
    try {
      const texts = chunks.map(chunk => chunk.content);
      const embeddings = await embeddingService.generateBatchEmbeddings(texts);

      chunks.forEach((chunk, index) => {
        chunk.embedding = embeddings.embeddings[index];
        chunk.embedding_model = embeddings.model;
      });

      console.log(`Generated embeddings for ${chunks.length} chunks`);
    } catch (error) {
      console.error('Error generating chunk embeddings:', error);
      // Continue without embeddings rather than failing completely
      chunks.forEach(chunk => {
        chunk.embedding = null;
        chunk.embedding_error = error.message;
      });
    }
  }

  optimizeChunks(chunks, targetSize = null) {
    if (!targetSize) {
      targetSize = this.defaultChunkSize;
    }

    return chunks.map(chunk => {
      if (chunk.content.length < this.minChunkSize) {
        // Mark small chunks for potential merging
        chunk.metadata.optimization_note = 'too_small';
      } else if (chunk.content.length > this.maxChunkSize) {
        // Mark large chunks for potential splitting
        chunk.metadata.optimization_note = 'too_large';
      } else {
        chunk.metadata.optimization_note = 'optimal';
      }

      return chunk;
    });
  }

  mergeSmallChunks(chunks, minSize = this.minChunkSize) {
    const merged = [];
    let currentChunk = null;

    for (const chunk of chunks) {
      if (!currentChunk) {
        currentChunk = { ...chunk };
      } else if (currentChunk.content.length < minSize &&
                 currentChunk.content.length + chunk.content.length < this.maxChunkSize) {
        // Merge with current chunk
        currentChunk.content += '\n\n' + chunk.content;
        currentChunk.metadata.merged_chunks = (currentChunk.metadata.merged_chunks || 1) + 1;
      } else {
        // Start new chunk
        merged.push(currentChunk);
        currentChunk = { ...chunk };
      }
    }

    if (currentChunk) {
      merged.push(currentChunk);
    }

    return merged;
  }
}

module.exports = new ChunkProcessor();