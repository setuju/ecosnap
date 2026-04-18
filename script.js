// ----- CONFIG -----
const GEMINI_API_KEY = window.ENV?.GEMINI_API_KEY || 'YOUR_API_KEY';
// Gunakan model yang memiliki kuota gratis
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ----- STATE -----
let selectedFile = null;
let isIdentifying = false;
let history = [];

// ----- INIT -----
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    setupEventListeners();
    checkApiKey();
    renderHistory();
});

function checkApiKey() {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_API_KEY') {
        console.warn('⚠️ Gemini API Key not set.');
    }
}

// ----- HISTORY MANAGEMENT -----
function loadHistory() {
    try {
        const saved = localStorage.getItem('ecosnap_history');
        if (saved) history = JSON.parse(saved);
    } catch (e) {
        history = [];
    }
}

function saveToHistory(imageData, plantData) {
    const entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        image: imageData,
        commonName: plantData.commonName,
        scientificName: plantData.scientificName
    };
    history.unshift(entry);
    if (history.length > 10) history.pop();
    localStorage.setItem('ecosnap_history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;
    
    if (history.length === 0) {
        container.innerHTML = '<p class="empty-message">No plants identified yet.</p>';
        return;
    }
    
    container.innerHTML = history.map(item => `
        <div class="history-item" data-id="${item.id}">
            <img src="${item.image}" alt="${item.commonName}">
            <div class="history-info">
                <div class="history-name">${item.commonName}</div>
                <div class="history-scientific">${item.scientificName}</div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color: var(--text-secondary);"></i>
        </div>
    `).join('');
    
    // Klik history item untuk melihat detail (opsional)
    document.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', () => {
            const id = Number(el.dataset.id);
            const entry = history.find(h => h.id === id);
            if (entry) {
                // Scroll ke hasil (jika ada)
                document.getElementById('resultCard')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

function clearHistory() {
    if (confirm('Clear all identification history?')) {
        history = [];
        localStorage.removeItem('ecosnap_history');
        renderHistory();
    }
}

// ----- EVENT LISTENERS -----
function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const imageInput = document.getElementById('imageInput');
    const identifyBtn = document.getElementById('identifyBtn');
    const removeBtn = document.getElementById('removeImageBtn');
    const cameraBtn = document.getElementById('cameraBtn');
    const copyBtn = document.getElementById('copyResultBtn');
    const shareBtn = document.getElementById('shareResultBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    uploadArea.addEventListener('click', () => imageInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--accent)';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--border)';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border)';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) handleFileSelect(file);
    });

    // Paste dari clipboard
    window.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                handleFileSelect(file);
                break;
            }
        }
    });

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFileSelect(file);
    });

    removeBtn.addEventListener('click', resetImage);
    cameraBtn.addEventListener('click', () => {
        imageInput.setAttribute('capture', 'environment');
        imageInput.click();
    });

    identifyBtn.addEventListener('click', identifyPlant);

    copyBtn.addEventListener('click', copyResult);
    shareBtn.addEventListener('click', shareResult);

    clearHistoryBtn.addEventListener('click', clearHistory);
}

function handleFileSelect(file) {
    if (file.size > 5 * 1024 * 1024) {
        alert('File too large. Max 5MB.');
        return;
    }

    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('previewImage');
        preview.src = e.target.result;
        document.getElementById('previewContainer').style.display = 'block';
        document.getElementById('uploadArea').style.display = 'none';
        document.getElementById('identifyBtn').disabled = false;
    };
    reader.readAsDataURL(file);
}

function resetImage() {
    selectedFile = null;
    document.getElementById('previewContainer').style.display = 'none';
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('imageInput').value = '';
    document.getElementById('identifyBtn').disabled = true;
    document.getElementById('resultCard').style.display = 'none';
    document.getElementById('tipsCard').style.display = 'none';
}

// ----- IDENTIFY PLANT (dengan parsing yang lebih kuat) -----
async function identifyPlant() {
    if (!selectedFile) return;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_API_KEY') {
        alert('Please set your Gemini API Key in config.js');
        return;
    }

    isIdentifying = true;
    const btn = document.getElementById('identifyBtn');
    const spinner = btn.querySelector('.loading-spinner');
    btn.disabled = true;
    spinner.style.display = 'inline-block';
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';

    try {
        const base64 = await fileToBase64(selectedFile);
        const base64Data = base64.split(',')[1];

        const prompt = `You are a botanist and ecological gardening expert. Analyze this plant image and return a STRICTLY VALID JSON object with the following structure:
{
  "commonName": "string",
  "scientificName": "string",
  "description": "string",
  "care": { "light": "string", "water": "string", "soil": "string" },
  "ecologicalBenefit": "string",
  "companions": ["string", "string", "string"]
}
Do not include any markdown formatting, code blocks, or extra text. Only the JSON object.`;

        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: selectedFile.type, data: base64Data } }
                ]
            }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 800 }
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            const message = errorData.error?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text) throw new Error('Empty response from API');

        const plantData = parseGeminiResponse(text);
        
        // Simpan gambar untuk history
        const previewImg = document.getElementById('previewImage').src;
        
        displayResult(plantData);
        generateGardenTips(plantData);
        saveToHistory(previewImg, plantData);

    } catch (error) {
        console.error('Identification failed:', error);
        alert(`Failed to identify plant: ${error.message}`);
    } finally {
        isIdentifying = false;
        btn.disabled = false;
        spinner.style.display = 'none';
        btn.innerHTML = '<i class="fa-solid fa-microchip"></i> Identify Plant';
    }
}

function parseGeminiResponse(text) {
    // Hapus markdown code blocks jika ada
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // Coba ekstrak JSON dengan regex
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        throw new Error('Invalid JSON format');
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function displayResult(data) {
    const container = document.getElementById('plantInfo');
    container.innerHTML = `
        <div class="info-row"><span class="info-label">Common Name</span><span class="info-value">${data.commonName || 'Unknown'}</span></div>
        <div class="info-row"><span class="info-label">Scientific Name</span><span class="info-value"><i>${data.scientificName || 'Unknown'}</i></span></div>
        <div class="info-row"><span class="info-label">Description</span><span class="info-value">${data.description || 'No description'}</span></div>
        <div class="info-row"><span class="info-label">Light</span><span class="info-value">${data.care?.light || 'N/A'}</span></div>
        <div class="info-row"><span class="info-label">Water</span><span class="info-value">${data.care?.water || 'N/A'}</span></div>
        <div class="info-row"><span class="info-label">Soil</span><span class="info-value">${data.care?.soil || 'N/A'}</span></div>
        <div class="info-row"><span class="info-label">Ecological Benefit</span><span class="info-value">${data.ecologicalBenefit || 'N/A'}</span></div>
    `;
    document.getElementById('resultCard').style.display = 'block';
}

function generateGardenTips(data) {
    const companions = data.companions || [];
    const tipsContainer = document.getElementById('gardenTips');
    
    let tipsHtml = `<p><i class="fa-solid fa-leaf"></i> <strong>Companion Plants for Biodiversity:</strong></p><ul>`;
    companions.forEach(c => tipsHtml += `<li>${c}</li>`);
    tipsHtml += `</ul>`;
    tipsHtml += `<p>💧 <strong>Eco Gardening Tip:</strong> Plant native species to support local pollinators and reduce water usage.</p>`;
    
    tipsContainer.innerHTML = tipsHtml;
    document.getElementById('tipsCard').style.display = 'block';
}

// ----- SHARE & COPY -----
function copyResult() {
    const plantInfo = document.getElementById('plantInfo');
    if (!plantInfo) return;
    
    const text = Array.from(plantInfo.querySelectorAll('.info-row'))
        .map(row => {
            const label = row.querySelector('.info-label')?.textContent || '';
            const value = row.querySelector('.info-value')?.textContent || '';
            return `${label}: ${value}`;
        })
        .join('\n');
    
    navigator.clipboard.writeText(text);
    alert('Plant info copied to clipboard!');
}

function shareResult() {
    if (!currentPlantData) {
        alert('No plant data to share');
        return;
    }
    
    const text = `I just identified ${currentPlantData.commonName} (${currentPlantData.scientificName}) with EcoSnap! 🌱`;
    const url = window.location.href;
    
    if (navigator.share) {
        navigator.share({ title: 'EcoSnap Plant Identification', text, url });
    } else {
        navigator.clipboard.writeText(`${text} ${url}`);
        alert('Link copied to clipboard!');
    }
}

// Simpan data terakhir untuk share
let currentPlantData = null;
const originalDisplayResult = displayResult;
displayResult = function(data) {
    currentPlantData = data;
    originalDisplayResult(data);
};
