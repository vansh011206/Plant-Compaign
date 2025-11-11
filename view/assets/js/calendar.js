        // Plant quotes array
        const quotes = [
            "Plants give us oxygen for the lungs and for the soul 🌸",
            "In every walk with nature, one receives far more than he seeks 🌿",
            "The glory of gardening: hands in the dirt, head in the sun, heart with nature 🌻",
            "To plant a garden is to believe in tomorrow 🌱",
            "Where flowers bloom, so does hope 🌺",
            "Plants are the young of the world, vessels of health and vigor 🍃",
            "Gardening is the purest of human pleasures 🌹",
            "Look deep into nature and you will understand everything better 🌳",
            "Every plant is a factory producing sugar through photosynthesis 🌾",
            "A garden requires patient labor and attention. Plants do not grow merely to satisfy ambitions 🌼"
        ];

        // Initialize variables
        let currentDate = new Date();
        let selectedDate = null;

        // Get daily quote based on date
        function getDailyQuote() {
            const dayOfYear = Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 0)) / 86400000);
            return quotes[dayOfYear % quotes.length];
        }

        // Display daily quote
        document.getElementById('dailyQuote').textContent = getDailyQuote();

        // Calendar functions
        function renderCalendar() {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            
            // Set month and year in header
            const monthNames = ["January", "February", "March", "April", "May", "June",
                              "July", "August", "September", "October", "November", "December"];
            document.getElementById('monthYear').textContent = `${monthNames[month]} ${year}`;

            // Get first day of month and number of days
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const daysInPrevMonth = new Date(year, month, 0).getDate();

            const calendarDates = document.getElementById('calendarDates');
            calendarDates.innerHTML = '';

            // Previous month's trailing days
            for (let i = firstDay - 1; i >= 0; i--) {
                const dateCell = createDateCell(daysInPrevMonth - i, true);
                calendarDates.appendChild(dateCell);
            }

            // Current month's days
            const today = new Date();
            for (let day = 1; day <= daysInMonth; day++) {
                const isToday = day === today.getDate() && 
                               month === today.getMonth() && 
                               year === today.getFullYear();
                const dateCell = createDateCell(day, false, isToday);
                calendarDates.appendChild(dateCell);
            }

            // Next month's leading days
            const remainingCells = 42 - (firstDay + daysInMonth);
            for (let day = 1; day <= remainingCells; day++) {
                const dateCell = createDateCell(day, true);
                calendarDates.appendChild(dateCell);
            }
        }

        function createDateCell(day, isOtherMonth, isToday = false) {
            const cell = document.createElement('div');
            cell.className = 'date-cell';
            if (isOtherMonth) cell.classList.add('other-month');
            if (isToday) cell.classList.add('current');

            const dayNumber = document.createElement('div');
            dayNumber.textContent = day;
            cell.appendChild(dayNumber);

            // Add random performance dots (for demo)
            if (!isOtherMonth) {
                const dotsContainer = document.createElement('div');
                dotsContainer.className = 'date-dots';
                
                const performances = ['good', 'moderate', 'poor'];
                const randomPerformance = performances[Math.floor(Math.random() * performances.length)];
                
                const dot = document.createElement('div');
                dot.className = `dot ${randomPerformance}`;
                dotsContainer.appendChild(dot);
                
                cell.appendChild(dotsContainer);

                // Add click event
                cell.addEventListener('click', () => showDateDetail(day, randomPerformance));
            }

            return cell;
        }

        function showDateDetail(day, performance) {
            const monthNames = ["January", "February", "March", "April", "May", "June",
                              "July", "August", "September", "October", "November", "December"];
            const modal = document.getElementById('dateModal');
            const overlay = document.getElementById('modalOverlay');
            const modalDate = document.getElementById('modalDate');
            const modalContent = document.getElementById('modalContent');

            modalDate.textContent = `${monthNames[currentDate.getMonth()]} ${day}, ${currentDate.getFullYear()}`;
            
            let statusText = '';
            if (performance === 'good') {
                statusText = '🟢 Great day! All plants were watered and received adequate sunlight.';
            } else if (performance === 'moderate') {
                statusText = '🟡 Moderate day. Some tasks were completed, but room for improvement.';
            } else {
                statusText = '🔴 Needs attention. Several plant care tasks were missed.';
            }
            
            modalContent.textContent = statusText;

            modal.classList.add('active');
            overlay.classList.add('active');
        }

        // Calendar navigation
        document.getElementById('prevMonth').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });

        document.getElementById('nextMonth').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });

        // Close modal
        document.getElementById('closeModal').addEventListener('click', () => {
            document.getElementById('dateModal').classList.remove('active');
            document.getElementById('modalOverlay').classList.remove('active');
        });

        document.getElementById('modalOverlay').addEventListener('click', () => {
            document.getElementById('dateModal').classList.remove('active');
            document.getElementById('modalOverlay').classList.remove('active');
        });

        // To-Do List functionality
        let todos = [];

        function saveTodos() {
            const todosData = JSON.stringify(todos);
            // Store in memory for this session
            window.todosData = todosData;
        }

        function loadTodos() {
            // Load from memory if available
            if (window.todosData) {
                todos = JSON.parse(window.todosData);
            } else {
                // Default tasks
                todos = [
                    { id: 1, text: 'Water the indoor plants', completed: false },
                    { id: 2, text: 'Check sunlight exposure for succulents', completed: false },
                    { id: 3, text: 'Fertilize tomato plants', completed: false },
                    { id: 4, text: 'Prune dead leaves', completed: false }
                ];
            }
            renderTodos();
        }

        function renderTodos() {
            const todoList = document.getElementById('todoList');
            todoList.innerHTML = '';

            todos.forEach(todo => {
                const li = document.createElement('li');
                li.className = `todo-item ${todo.completed ? 'completed' : ''}`;

                const checkbox = document.createElement('div');
                checkbox.className = `checkbox ${todo.completed ? 'checked' : ''}`;
                checkbox.addEventListener('click', () => toggleTodo(todo.id));

                const text = document.createElement('span');
                text.className = 'todo-text';
                text.textContent = todo.text;

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.textContent = '×';
                deleteBtn.addEventListener('click', () => deleteTodo(todo.id));

                li.appendChild(checkbox);
                li.appendChild(text);
                li.appendChild(deleteBtn);
                todoList.appendChild(li);
            });
        }

        function toggleTodo(id) {
            todos = todos.map(todo => 
                todo.id === id ? { ...todo, completed: !todo.completed } : todo
            );
            saveTodos();
            renderTodos();
        }

        function deleteTodo(id) {
            todos = todos.filter(todo => todo.id !== id);
            saveTodos();
            renderTodos();
        }

        document.getElementById('addTaskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('taskInput');
            const text = input.value.trim();

            if (text) {
                const newTodo = {
                    id: Date.now(),
                    text: text,
                    completed: false
                };
                todos.push(newTodo);
                saveTodos();
                renderTodos();
                input.value = '';
            }
        });

        // Initialize
        renderCalendar();
        loadTodos();