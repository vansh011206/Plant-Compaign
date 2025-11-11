        let uploadedImage = null;
        let currentPlant = null;

        const uploadZone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');
        const previewImg = document.getElementById('previewImg');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const resultPopup = document.getElementById('resultPopup');
        const toast = document.getElementById('toast');

        uploadZone.onclick = () => fileInput.click();
        fileInput.onchange = e => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = () => {
                    uploadedImage = reader.result;
                    previewImg.src = uploadedImage;
                    uploadZone.classList.add('active');
                    analyzeBtn.style.display = 'inline-flex';
                };
                reader.readAsDataURL(file);
            }
        };

        analyzeBtn.onclick = async () => {
            if (!uploadedImage) return;
            analyzeBtn.textContent = "Analyzing...";
            analyzeBtn.classList.add('loading');

            try {
                const res = await fetch('http://localhost:5000/api/identify-plant', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64: uploadedImage })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed");

                currentPlant = data.plant;

// Update popup - CORRECT FIELD NAMES
// document.getElementById('plantName').textContent = currentPlant.commonName;
document.getElementById('scientificName').textContent = currentPlant.scientificName;
// document.getElementById('familyBadge').textContent = currentPlant.family;
document.getElementById('confidenceText').textContent = currentPlant.confidence + '%';
document.getElementById('careWater').textContent = currentPlant.care.water;
document.getElementById('careLight').textContent = currentPlant.care.light;
document.getElementById('careSoil').textContent = currentPlant.care.soil;
document.getElementById('careTemp').textContent = currentPlant.care.temp;
document.getElementById('careToxic').textContent = currentPlant.care.toxic;

// Confidence circle
document.querySelector('.confidence-circle').style.setProperty('--percent', currentPlant.confidence / 100);

// Show popup
resultPopup.style.display = 'flex';
showToast(`${currentPlant.commonName} Detected!`);

            } catch (err) {
                showToast("Error: " + err.message);
            }

            analyzeBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="11" cy="11" r="8" stroke="white" stroke-width="2"/>
                    <path d="M21 21L16.65 16.65" stroke="white" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Analyze Plant
            `;
            analyzeBtn.classList.remove('loading');
        };

        function addToGarden() {
    let garden = JSON.parse(localStorage.getItem('myGarden') || '[]');
    const plantWithDate = { ...currentPlant, addedAt: new Date().toISOString() };
    garden.push(plantWithDate);
    localStorage.setItem('myGarden', JSON.stringify(garden));

    // Trigger emails
    fetch('/api/add-to-garden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plant: plantWithDate })
    }).then(() => {
        showToast("Added to My Garden! Emails Sent!");
        createConfetti();
    }).catch(() => {
        showToast("Added locally. Emails will sync later.");
    });
}
        function closePopup() {
            resultPopup.style.display = 'none';
            uploadedImage = null;
            previewImg.src = '';
            uploadZone.classList.remove('active');
            analyzeBtn.style.display = 'none';
        }

        function addToGarden() {
            let garden = JSON.parse(localStorage.getItem('myGarden') || '[]');
            garden.push({ ...currentPlant, addedAt: new Date().toISOString() });
            localStorage.setItem('myGarden', JSON.stringify(garden));
            showToast("Added to My Garden!");
        }

        function showToast(msg) {
            toast.textContent = msg;
            toast.classList.add('active');
            setTimeout(() => toast.classList.remove('active'), 3000);
        }

        // Confetti on success
        function createConfetti() {
            for (let i = 0; i < 60; i++) {
                const c = document.createElement('div');
                c.style.position = 'fixed';
                c.style.left = Math.random() * 100 + 'vw';
                c.style.top = '-10px';
                c.style.width = '10px';
                c.style.height = '10px';
                c.style.background = ['#059669', '#047857', '#10b981'][Math.floor(Math.random() * 3)];
                c.style.borderRadius = '50%';
                c.style.zIndex = '9999';
                c.style.animation = 'fall 3s linear forwards';
                document.body.appendChild(c);
                setTimeout(() => c.remove(), 3000);
            }
        }