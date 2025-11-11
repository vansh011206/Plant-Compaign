        // Backend URL for future use
        const backendUrl = 'http://localhost:5000';

        // ==================== MOBILE MENU TOGGLE ====================
        const menuToggle = document.querySelector('.menu-toggle');
        const navLinks = document.querySelector('.nav-links');

        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        // Close mobile menu when clicking a link
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });

        // ==================== SCROLL SPY (ACTIVE NAV LINK) ====================
        const sections = document.querySelectorAll('section[id]');
        const navItems = document.querySelectorAll('.nav-links a');

        function highlightNavOnScroll() {
            const scrollY = window.pageYOffset;

            sections.forEach(section => {
                const sectionHeight = section.offsetHeight;
                const sectionTop = section.offsetTop - 100;
                const sectionId = section.getAttribute('id');

                if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                    navItems.forEach(item => {
                        item.classList.remove('active');
                        if (item.getAttribute('href') === `#${sectionId}`) {
                            item.classList.add('active');
                        }
                    });
                }
            });

            // Handle home link when at top
            if (scrollY < 100) {
                navItems.forEach(item => {
                    item.classList.remove('active');
                    if (item.getAttribute('href') === '#' || item.textContent.trim() === 'Home') {
                        item.classList.add('active');
                    }
                });
            }
        }

        window.addEventListener('scroll', highlightNavOnScroll);

        // ==================== FORM VALIDATION ====================
        const heroForm = document.getElementById('heroForm');
        const emailInput = document.getElementById('emailInput');
        const toast = document.getElementById('toast');

        heroForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(email)) {
                emailInput.style.borderColor = '#F44336';
                emailInput.focus();
                showToast('❌ Please enter a valid email address', '#F44336');
                return;
            }

            // Success
            emailInput.style.borderColor = '#4CAF50';
            showToast('🌱 Success! Check your email for next steps.', '#1A5F3A');
            
            // Reset form after 2 seconds
            setTimeout(() => {
                heroForm.reset();
                emailInput.style.borderColor = '#E0E0E0';
            }, 2000);

            // In production, send data to backend:
            // fetch(`${backendUrl}/api/subscribe`, {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify({ email })
            // });
        });

        function showToast(message, bgColor = '#1A5F3A') {
            toast.textContent = message;
            toast.style.background = bgColor;
            toast.classList.add('show');

            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }

        // ==================== INTERSECTION OBSERVER (FADE IN ANIMATIONS) ====================
        const observerOptions = {
            threshold: 0.3,
            rootMargin: '0px 0px -100px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, observerOptions);

        // Observe feature cards
        document.querySelectorAll('.feature-card').forEach(card => {
            observer.observe(card);
        });

        // ==================== BACK TO TOP BUTTON ====================
        const backToTopBtn = document.getElementById('backToTop');

        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });

        // ==================== LEARN MORE BUTTON ====================
        document.querySelector('.learn-more-btn').addEventListener('click', () => {
            showToast('📚 Feature coming soon! Stay tuned.', '#2E7D4E');
        });

        // ==================== SMOOTH NAVBAR BACKGROUND ON SCROLL ====================
        const navbar = document.querySelector('.navbar');
        let lastScroll = 0;

        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;

            if (currentScroll > 50) {
                navbar.style.boxShadow = '0 4px 30px rgba(26, 95, 58, 0.2)';
            } else {
                navbar.style.boxShadow = '0 2px 20px rgba(26, 95, 58, 0.15)';
            }

            lastScroll = currentScroll;
        });

        // ==================== PREVENT DOUBLE-SUBMIT ====================
        let isSubmitting = false;
        heroForm.addEventListener('submit', (e) => {
            if (isSubmitting) {
                e.preventDefault();
                return;
            }
            isSubmitting = true;
            setTimeout(() => {
                isSubmitting = false;
            }, 2000);
        });

        // ==================== CONSOLE EASTER EGG ====================
        console.log('%c🌱 PlantCare Companion', 'font-size: 24px; color: #1A5F3A; font-weight: bold;');
        console.log('%cBuilt with ❤️ for plant lovers everywhere', 'font-size: 14px; color: #4CAF50;');
        console.log('%cInterested in the code? Check out our GitHub!', 'font-size: 12px; color: #666;');
    