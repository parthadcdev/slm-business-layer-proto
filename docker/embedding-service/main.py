#!/usr/bin/env python3
"""
Embedding Service
Provides text embedding capabilities using sentence transformers.
"""

import os
import time
import logging
from typing import List, Dict, Any
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
MODEL_NAME = os.getenv("MODEL_NAME", "all-MiniLM-L6-v2")
DEVICE = os.getenv("DEVICE", "cpu")
MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "32"))
CACHE_SIZE = int(os.getenv("CACHE_SIZE", "1000"))
PORT = int(os.getenv("PORT", "8001"))
HOST = os.getenv("HOST", "0.0.0.0")

# Global model instance
model = None
embedding_cache = {}


class TextRequest(BaseModel):
    text: str = Field(..., description="Text to embed", max_length=8192)
    model: str = Field(default=MODEL_NAME, description="Model to use for embedding")


class BatchTextRequest(BaseModel):
    texts: List[str] = Field(..., description="List of texts to embed", max_items=MAX_BATCH_SIZE)
    model: str = Field(default=MODEL_NAME, description="Model to use for embedding")


class EmbeddingResponse(BaseModel):
    embedding: List[float] = Field(..., description="Text embedding vector")
    model: str = Field(..., description="Model used for embedding")
    text_length: int = Field(..., description="Length of input text")
    processing_time: float = Field(..., description="Processing time in seconds")


class BatchEmbeddingResponse(BaseModel):
    embeddings: List[List[float]] = Field(..., description="List of embedding vectors")
    model: str = Field(..., description="Model used for embedding")
    count: int = Field(..., description="Number of embeddings generated")
    processing_time: float = Field(..., description="Total processing time in seconds")


class HealthResponse(BaseModel):
    status: str = Field(..., description="Service status")
    model: str = Field(..., description="Current model")
    device: str = Field(..., description="Device being used")
    cache_size: int = Field(..., description="Current cache size")
    uptime: float = Field(..., description="Service uptime in seconds")


# Global variables for health monitoring
start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown."""
    # Startup
    global model
    logger.info(f"Loading embedding model: {MODEL_NAME}")
    try:
        model = SentenceTransformer(MODEL_NAME, device=DEVICE)
        logger.info(f"Model loaded successfully on device: {DEVICE}")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down embedding service")


# Create FastAPI app
app = FastAPI(
    title="SLM Embedding Service",
    description="Text embedding service using sentence transformers",
    version="1.0.0",
    lifespan=lifespan
)


def get_cache_key(text: str, model_name: str) -> str:
    """Generate cache key for text and model combination."""
    return f"{model_name}:{hash(text)}"


def add_to_cache(key: str, embedding: List[float]):
    """Add embedding to cache with size limit."""
    global embedding_cache

    if len(embedding_cache) >= CACHE_SIZE:
        # Remove oldest entry (simple FIFO)
        oldest_key = next(iter(embedding_cache))
        del embedding_cache[oldest_key]

    embedding_cache[key] = embedding


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy" if model is not None else "unhealthy",
        model=MODEL_NAME,
        device=DEVICE,
        cache_size=len(embedding_cache),
        uptime=time.time() - start_time
    )


@app.post("/embed", response_model=EmbeddingResponse)
async def embed_text(request: TextRequest):
    """Generate embedding for a single text."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    start_time_req = time.time()

    try:
        # Check cache first
        cache_key = get_cache_key(request.text, request.model)
        if cache_key in embedding_cache:
            logger.debug("Cache hit for text embedding")
            embedding = embedding_cache[cache_key]
        else:
            # Generate embedding
            logger.debug(f"Generating embedding for text of length {len(request.text)}")
            embedding_array = model.encode([request.text])[0]
            embedding = embedding_array.tolist()

            # Add to cache
            add_to_cache(cache_key, embedding)

        processing_time = time.time() - start_time_req

        return EmbeddingResponse(
            embedding=embedding,
            model=request.model,
            text_length=len(request.text),
            processing_time=processing_time
        )

    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")


@app.post("/embed_batch", response_model=BatchEmbeddingResponse)
async def embed_batch(request: BatchTextRequest):
    """Generate embeddings for multiple texts."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if len(request.texts) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size {len(request.texts)} exceeds maximum {MAX_BATCH_SIZE}"
        )

    start_time_req = time.time()

    try:
        embeddings = []
        cache_hits = 0

        # Check cache and collect texts that need processing
        texts_to_process = []
        text_indices = []

        for i, text in enumerate(request.texts):
            cache_key = get_cache_key(text, request.model)
            if cache_key in embedding_cache:
                embeddings.append(embedding_cache[cache_key])
                cache_hits += 1
            else:
                embeddings.append(None)  # Placeholder
                texts_to_process.append(text)
                text_indices.append(i)

        # Process uncached texts
        if texts_to_process:
            logger.debug(f"Processing {len(texts_to_process)} texts, {cache_hits} cache hits")
            new_embeddings = model.encode(texts_to_process)

            # Update embeddings list and cache
            for idx, embedding_array in enumerate(new_embeddings):
                text_idx = text_indices[idx]
                embedding = embedding_array.tolist()
                embeddings[text_idx] = embedding

                # Add to cache
                cache_key = get_cache_key(texts_to_process[idx], request.model)
                add_to_cache(cache_key, embedding)

        processing_time = time.time() - start_time_req

        return BatchEmbeddingResponse(
            embeddings=embeddings,
            model=request.model,
            count=len(embeddings),
            processing_time=processing_time
        )

    except Exception as e:
        logger.error(f"Error generating batch embeddings: {e}")
        raise HTTPException(status_code=500, detail=f"Batch embedding generation failed: {str(e)}")


@app.get("/model_info")
async def get_model_info():
    """Get information about the current model."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Get model dimensions by encoding a test string
        test_embedding = model.encode(["test"])
        dimensions = test_embedding.shape[1] if len(test_embedding.shape) > 1 else len(test_embedding[0])

        return {
            "model": MODEL_NAME,
            "dimensions": dimensions,
            "max_sequence_length": getattr(model.tokenizer, 'model_max_length', 'unknown'),
            "tokenizer": model.tokenizer.__class__.__name__ if hasattr(model, 'tokenizer') else 'unknown',
            "device": str(model.device) if hasattr(model, 'device') else DEVICE
        }
    except Exception as e:
        logger.error(f"Error getting model info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get model info: {str(e)}")


@app.post("/clear_cache")
async def clear_cache():
    """Clear the embedding cache."""
    global embedding_cache
    cache_size = len(embedding_cache)
    embedding_cache.clear()

    logger.info(f"Cleared embedding cache ({cache_size} entries)")
    return {"message": f"Cache cleared ({cache_size} entries removed)"}


@app.get("/stats")
async def get_stats():
    """Get service statistics."""
    return {
        "model": MODEL_NAME,
        "device": DEVICE,
        "cache_size": len(embedding_cache),
        "max_cache_size": CACHE_SIZE,
        "max_batch_size": MAX_BATCH_SIZE,
        "uptime": time.time() - start_time,
        "cache_hit_ratio": "N/A"  # Would need request tracking to calculate
    }


if __name__ == "__main__":
    logger.info(f"Starting embedding service on {HOST}:{PORT}")
    logger.info(f"Model: {MODEL_NAME}, Device: {DEVICE}")

    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info"
    )