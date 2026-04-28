import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import Replicate from 'replicate';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ROBUST STATIC SERVING
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
console.log(`Serving static files from: ${publicPath}`);

const GALLERY_JSON = path.join(__dirname, 'gallery.json');
const GALLERY_DIR = path.join(__dirname, 'public', 'gallery');

// Ensure directories exist
try {
    await fs.mkdir(GALLERY_DIR, { recursive: true });
    console.log(`Gallery directory ready: ${GALLERY_DIR}`);
} catch (err) {
    console.error("Error creating gallery dir:", err);
}

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.post('/api/generate', async (req, res) => {
    console.log("--- AI Generation Request ---");
    try {
        const { image } = req.body;
        if (!image) return res.status(400).json({ error: 'No image uploaded' });

        if (!process.env.REPLICATE_API_TOKEN) {
            console.warn("REPLICATE_API_TOKEN missing. Using simulation.");
            return res.json({ imageUrl: '/dragon_mascot.png' });
        }

        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
        const promptText = "Pixar style 3D character transformation. A cute baby dragon on the person's shoulder. High quality, cinematic lighting, Disney animation aesthetic.";

        console.log("Calling SDXL for stable transformation...");
        const output = await replicate.run(
            "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
            {
                input: {
                    prompt: promptText,
                    image: image,
                    prompt_strength: 0.7
                }
            }
        ).catch(err => {
            console.error("Replicate API specific error:", err.message);
            throw err;
        });

        let generatedUrl = Array.isArray(output) ? output[0] : output;
        if (!generatedUrl) {
            throw new Error("No output from Replicate");
        }

        console.log("Replicate output URL:", generatedUrl);

        // LOCAL CACHE TO PREVENT BROKEN LINKS
        try {
            const tempFileName = `preview_${Date.now()}.png`;
            const tempFilePath = path.join(publicPath, tempFileName);
            
            let buffer;
            if (typeof generatedUrl === 'string' && generatedUrl.startsWith('http')) {
                const imgResponse = await fetch(generatedUrl);
                if (!imgResponse.ok) throw new Error(`Fetch failed with status ${imgResponse.status}`);
                buffer = Buffer.from(await imgResponse.arrayBuffer());
            } else if (generatedUrl instanceof ReadableStream || (generatedUrl && typeof generatedUrl.getReader === 'function')) {
                // Handle stream
                const reader = generatedUrl.getReader();
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
                buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
            } else {
                throw new Error("Unknown output format from Replicate");
            }

            await fs.writeFile(tempFilePath, buffer);
            generatedUrl = `/${tempFileName}`;
            console.log("Successfully cached locally:", generatedUrl);
        } catch (downloadErr) {
            console.error("Local cache download error:", downloadErr.message);
        }

        res.json({ imageUrl: generatedUrl });
    } catch (error) {
        console.error("CRITICAL AI Error:", error.message);
        res.status(500).json({
            error: error.message,
            imageUrl: null
        });
    }
});

app.post('/api/gallery', async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) return res.status(400).json({ error: 'No image URL' });

        const fileName = `shared_${Date.now()}.png`;
        const filePath = path.join(GALLERY_DIR, fileName);
        const publicRelativePath = `/gallery/${fileName}`;

        if (imageUrl.startsWith('http')) {
            const response = await fetch(imageUrl);
            const buffer = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(filePath, buffer);
        } else if (imageUrl.startsWith('data:image')) {
            const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
            await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
        } else if (imageUrl.startsWith('/')) {
            // Local file move/copy
            const sourcePath = path.join(publicPath, imageUrl);
            await fs.copyFile(sourcePath, filePath);
        }

        let galleryData = [];
        try {
            const existing = await fs.readFile(GALLERY_JSON, 'utf-8');
            galleryData = JSON.parse(existing);
        } catch (e) { }

        galleryData.unshift({
            id: Date.now(),
            url: publicRelativePath,
            timestamp: new Date().toISOString()
        });

        await fs.writeFile(GALLERY_JSON, JSON.stringify(galleryData, null, 2));
        res.json({ success: true, item: galleryData[0] });

    } catch (error) {
        console.error("Gallery Save Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/gallery', async (req, res) => {
    try {
        const data = await fs.readFile(GALLERY_JSON, 'utf-8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.json([]);
    }
});

app.use((req, res) => {
    console.warn(`404 Not Found: ${req.method} ${req.url}`);
    res.status(404).send('Not Found');
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend server running at http://localhost:${PORT}`);
});
