import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import Replicate from 'replicate';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase (Optional for local, required for prod)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ROBUST STATIC SERVING
const publicPath = path.join(__dirname, 'public');
const distPath = path.join(__dirname, 'dist');

app.use(express.static(distPath));
app.use(express.static(publicPath));

console.log(`Serving static files from: ${distPath} and ${publicPath}`);

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
        // USER SPECIFIED DETAILED PROMPT
        const promptText = "High-quality, cinematic 3D photographic render in the iconic Pixar animation style. The scene is a faithful transformation of the input photo, maintaining the exact facial features, expressions, and specific clothing of all persons present in a pixar style. The original background is completely replaced by a vibrant, professionally decorated studio setting. This new environment is brimming with colorful balloons of various sizes, cascading metallic confetti (gold and primary colors) caught in mid-air, and a festive atmosphere. One friendly-looking cartoon dragon, with large expressive eyes and distinct scaled textures, are happily integrated into the scene. The lighting is soft, golden, and warm, mimicking cozy studio spotlights and fairy lights, casting a magical glow over the subjects. The overall composition is joyful and full of life, like a memorable photoshoot.";

        console.log("Calling SDXL for stable transformation...");
        const output = await replicate.run(
            "xai/grok-imagine-image",
            {
                input: {
                    image: image,
                    prompt: promptText,
                    aspect_ratio: "1:1"
                }
            }
        );

        if (!output) {
            throw new Error("No output from Replicate");
        }

        let generatedUrl;
        if (Array.isArray(output)) {
            generatedUrl = output[0];
        } else if (typeof output === 'string') {
            generatedUrl = output;
        } else if (output && typeof output.url === 'function') {
            generatedUrl = output.url();
        } else if (output && output.url) {
            generatedUrl = output.url;
        } else {
            generatedUrl = output; 
        }

        console.log("Resolved Generated URL:", typeof generatedUrl === 'string' ? generatedUrl : 'Object/Stream');

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

        if (supabase) {
            console.log("Saving to Supabase...");
            // 1. Upload to Supabase Storage if it's a local/data URL
            let publicUrl = imageUrl;
            
            if (imageUrl.startsWith('/') || imageUrl.startsWith('data:image')) {
                let buffer;
                if (imageUrl.startsWith('data:image')) {
                    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
                    buffer = Buffer.from(base64Data, 'base64');
                } else {
                    const sourcePath = path.join(publicPath, imageUrl);
                    buffer = await fs.readFile(sourcePath);
                }

                const fileName = `shared_${Date.now()}.png`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('gallery')
                    .upload(fileName, buffer, { contentType: 'image/png' });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('gallery')
                    .getPublicUrl(fileName);
                
                publicUrl = urlData.publicUrl;
            }

            // 2. Insert into DB
            const { data, error } = await supabase
                .from('gallery')
                .insert([{ url: publicUrl }])
                .select();

            if (error) throw error;
            return res.json({ success: true, item: data[0] });
        }

        // FALLBACK TO LOCAL (for local dev)
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
        if (supabase) {
            const { data, error } = await supabase
                .from('gallery')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            return res.json(data);
        }

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
