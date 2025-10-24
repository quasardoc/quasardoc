document.addEventListener('DOMContentLoaded', function() {

    // --- CONFIGURACIÓN DE GEMINI API ---
    // ¡IMPORTANTE! Reemplaza 'TU_API_KEY_DE_GEMINI_AQUI' con tu clave de API real.
    // Obtenla gratis desde Google AI Studio: https://makersuite.google.com/app/apikey
    const GEMINI_API_KEY = 'AIzaSyDDY8yh5KVzU_xm113rHXIcvK_sBv8jk0c';
    // Lista de modelos a probar en orden de preferencia. Si uno falla, intentará con el siguiente.
    const GEMINI_MODELS_TO_TRY = [
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash-lite-preview-02-05',
        'gemini-2.0-flash-lite-preview',
        'gemini-2.5-pro-preview-tts',
        'gemini-2.5-flash-preview-tts',
        'gemini-pro-latest',
        'gemini-flash-lite-latest',
        'gemini-flash-latest',
        'gemini-2.5-flash-preview-09-2025',
        'gemini-2.5-flash-lite-preview-09-2025',
        'gemini-2.5-flash-lite-preview-06-17',
        'gemini-2.5-pro-preview-06-05',
        'gemini-2.5-flash-preview-05-20',
        'gemini-2.0-flash-thinking-exp-01-21',
        'gemini-2.0-flash-thinking-exp',
        'gemini-2.0-flash-thinking-exp-1219',
        'gemini-2.5-pro-preview-05-06',
        'gemini-2.5-pro-preview-03-25',
        'gemini-2.0-pro-exp',
        'gemini-2.0-pro-exp-02-05',
        'gemini-exp-1206',
        'gemini-2.5-pro',
        'gemini-2.0-flash-exp',
        'gemini-2.0-flash',
        'gemini-2.0-flash-001',
        'gemini-2.0-flash-exp-image-generation',
        'gemini-2.0-flash-lite-001',
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash-preview-image-generation',
        'learnlm-2.0-flash-experimental',
        'gemini-2.5-flash-image-preview',
        'gemini-2.5-flash-image',
        'gemini-robotics-er-1.5-preview',
        'gemini-2.5-flash',
        'gemma-3-1b-it',
        'gemma-3-4b-it',
        'gemma-3-12b-it',
        'gemma-3-27b-it',
        'gemma-3n-e4b-it',
        'gemma-3n-e2b-it'
        
    ];

    // --- Elementos del DOM ---
    var chatWindow = document.getElementById('chat-window');
    var userInput = document.getElementById('user-input');
    var sendButton = document.getElementById('send-button');
    var settingsPanel = document.getElementById('settings-panel');
    var openSettingsBtn = document.getElementById('open-settings');
    var closeSettingsBtn = document.getElementById('close-settings');

    // --- LÓGICA PARA AJUSTAR ALTURA EN MÓVILES ---
    function setAppHeight() {
        var appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.style.height = window.innerHeight + 'px';
        }
    }
    window.addEventListener('resize', setAppHeight);
    setAppHeight(); // Ajustar altura al cargar la página

    // --- Estado de la Conversación y UI ---
    var conversationState = {
        stage: 'initial_prompt',
        query: '',
        chunks: []
    };
    var operationTimer = null;

    // --- Sistema de Archivos Virtual para la Demo ---
    var virtualFileSystem = {};

    // --- Manejadores de Eventos ---
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    openSettingsBtn.addEventListener('click', function() { settingsPanel.classList.toggle('visible'); });
    closeSettingsBtn.addEventListener('click', function() { settingsPanel.classList.toggle('visible'); });

    // --- Delegación de Eventos para Clics Dinámicos ---
    chatWindow.addEventListener('click', function(e) {
        var target = e.target;
        if (target.matches('.options-list button')) {
            var selectedOption = target.dataset.option;
            appendMessage(target.textContent, 'user-message');
            conversationState.query = selectedOption;
            conversationState.stage = 'execute_search'; // <-- CAMBIO: Saltar directamente a la búsqueda
            var searchMode = document.getElementById('tipo-busqueda').value;
            callChatAPI(conversationState.query, { filters: 'all', search_mode: searchMode });
        } else if (target.matches('.filter-list button')) { // Este bloque ya no se usará, pero se mantiene por si se reactiva.
            var selectedFilter = target.dataset.filter;
            appendMessage('Filtro seleccionado: ' + target.textContent, 'user-message');
            var searchMode = document.getElementById('tipo-busqueda').value;
            conversationState.stage = 'execute_search';
            callChatAPI(conversationState.query, { filters: selectedFilter, search_mode: searchMode });
        } else if (target.matches('#confirm-llm-gen')) {
            appendMessage('Sí, generar respuesta', 'user-message');
            conversationState.stage = 'generate_final_answer';
            callChatAPI(conversationState.query, { chunks: conversationState.chunks }); // CORRECCIÓN: Asegura que los chunks se envíen
        } else if (target.matches('#cancel-llm-gen') || target.matches('#new-query')) {
            appendMessage(target.textContent, 'user-message');
            resetConversation();
        } else if (target.matches('#follow-up-question')) {
            appendMessage(target.textContent, 'user-message');
            conversationState.stage = 'follow_up_question'; // Nuevo estado para seguimiento
            updateLastBotMessage('Claro, ¿qué más quieres saber sobre este contexto?');
            userInput.focus();
        } else if (target.matches('.refine-search-btn')) {
            var chunkContent = decodeURIComponent(target.dataset.content);
            var sourceFile = target.dataset.source;
            var message = 'Refinando la búsqueda a partir del fragmento del documento: ' + sourceFile.split('\\').pop();
            appendMessage(message, 'user-message');
            
            conversationState.query = chunkContent; // La nueva consulta es el contenido del fragmento
            conversationState.stage = 'execute_search';
            callChatAPI(chunkContent, { filters: [sourceFile], search_mode: 'detallada' });
        } else if (target.matches('.virtual-file-link')) {
            e.preventDefault(); // Evitar que el enlace navegue
            var sourceFile = target.dataset.source;
            var fileContent = virtualFileSystem[sourceFile];
            if (fileContent) {
                var newTab = window.open();
                newTab.document.open();
                newTab.document.write('<html lang="es"><head><title>' + sourceFile + '</title><style>body{font-family: sans-serif; line-height: 1.6; background-color: #f0f2f5; padding: 2rem;}</style></head><body><pre>' + fileContent.replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</pre></body></html>');
                newTab.document.close();
            } else {
                alert('El contenido de este archivo virtual no fue encontrado.');
            }
        } else if (target.matches('#generate-report')) {
            var answerContent = decodeURIComponent(target.dataset.answer);
            appendMessage('Generar informe de la respuesta', 'user-message');
            conversationState.stage = 'generate_report';
            // Llamamos a una nueva función para manejar la generación del informe
            generateSimulatedReport(answerContent);
        }
    });

    // --- Funciones Principales ---

    function sendMessage() {
        // Si estamos en modo seguimiento, la lógica es un poco diferente
        if (conversationState.stage === 'follow_up_question') {
            handleFollowUpMessage();
            return;
        }
        var messageText = userInput.value.trim();
        if (!messageText) return;

        appendMessage(messageText, 'user-message');
        userInput.value = '';
        userInput.style.height = 'auto';

        conversationState.stage = 'initial_prompt';
        callChatAPI(messageText);
    }

    function handleFollowUpMessage() {
        var messageText = userInput.value.trim();
        if (!messageText) return;

        appendMessage(messageText, 'user-message');
        userInput.value = '';
        userInput.style.height = 'auto';

        // Llamamos a la API con el estado de seguimiento y los chunks guardados
        callChatAPI(messageText, { chunks: conversationState.chunks });
    }

    // ==================================================
    // --- SIMULACIÓN DE LA API DE FLASK (/api/chat) ---
    // ==================================================
    function callChatAPI(message, additionalData) {
        if (additionalData === void 0) { additionalData = {}; }
        startLiveTimer(); // Iniciar cronómetro para CUALQUIER llamada

        var payload = {
            message: message,
            stage: conversationState.stage,
            show_process: document.getElementById('mostrar-proceso').checked,
            smart_prompt: document.getElementById('usar-prompt-inteligente').checked,
            ...additionalData
        };

        // En lugar de fetch, llamamos a un simulador
        simulateApiChat(payload)
            .then(function(data) {
                stopLiveTimer();
                handleBotResponse(data);
            })
            .catch(function(error) {
                console.error('Error en la simulación de la API:', error);
                stopLiveTimer();
                updateLastBotMessage('Lo siento, ha ocurrido un error en la simulación.');
            });
    }

    /**
     * Llama a la API de Google Gemini para obtener una respuesta.
     * @param {string} prompt El prompt completo para enviar al modelo.
     * @returns {Promise<string>} La respuesta de texto del modelo.
     */
    async function callGeminiAPI(prompt) {
        if (GEMINI_API_KEY === 'TU_API_KEY_DE_GEMINI_AQUI') {
            console.error("API Key de Gemini no configurada.");
            return "Error: La API Key de Gemini no ha sido configurada en `script.js`. Por favor, añade tu clave para continuar.";
        }

        let lastError = null;

        for (const model of GEMINI_MODELS_TO_TRY) {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            console.log(`Intentando con el modelo: ${model}`);

            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                ]
            };

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    let errorBody = await response.json().catch(() => null);
                    let errorMessage = (errorBody && errorBody.error && errorBody.error.message) ? errorBody.error.message : `HTTP ${response.status}`;
                    throw new Error(errorMessage);
                }

                const data = await response.json();
                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
                    console.log(`Éxito con el modelo: ${model}`);
                    return data.candidates[0].content.parts[0].text;
                }
                return "La API de Gemini no devolvió contenido. Esto puede ocurrir si la pregunta activa los filtros de seguridad.";

            } catch (error) {
                lastError = error;
                console.warn(`Falló el modelo ${model}: ${error.message}`);
                // Si el error es que el modelo no se encontró, continuamos con el siguiente.
                if (error.message.includes('is not found') || error.message.includes('not found')) {
                    continue;
                }
                // Para otros errores (ej. clave inválida, problema de red), fallamos inmediatamente.
                break;
            }
        }

        const finalErrorMessage = `Lo siento, no se pudo contactar la API de Gemini. Ninguno de los modelos configurados funcionó. Último error: ${lastError.message}`;
        console.error(finalErrorMessage);
        return finalErrorMessage;
    }

    /**
     * Usa Gemini para generar fragmentos de búsqueda simulados y realistas.
     * @param {string} query La pregunta del usuario.
     * @param {number} count El número de fragmentos a generar.
     * @returns {Promise<Array>} Una lista de objetos de fragmento.
     */
    async function generateFragmentsWithGemini(query, count = 5) {
        console.log(`Generando ${count} fragmentos con Gemini para la consulta: "${query}"`);
        const prompt = `
            **Tarea:**
            Eres un generador de datos de búsqueda simulados. Basado en la pregunta del usuario, crea ${count} fragmentos de texto ficticios que parezcan provenir de documentos relevantes.

            **Pregunta del usuario:**
            "${query}"

            **Instrucciones de formato de salida:**
            1.  Genera una respuesta en formato JSON. La respuesta debe ser un array de ${count} objetos.
            2.  Cada objeto representa un fragmento y debe tener las siguientes claves:
                - "content": Un texto de aproximadamente 500 caracteres en español, relevante para la pregunta.
                - "source": Un nombre de archivo ficticio y creíble (ej. "informe_financiero_2023.pdf", "politica_de_vacaciones.docx").
                - "page_num": Un número de página aleatorio entre 1 y 100.
                - "score": Un número de relevancia simulado (un float entre 0.85 y 0.98).
                - "full_document_text": El contenido completo del documento ficticio (alrededor de 3 o 4 párrafos), del cual se extrajo el 'content'. Este texto debe ser coherente.
            3.  La respuesta DEBE ser únicamente el array JSON, sin texto adicional, explicaciones o markdown.

            **Ejemplo de salida:**
            [
              {
                "content": "El análisis de flujo de caja para el tercer trimestre muestra un incremento del 15% en los ingresos operativos, impulsado principalmente por la nueva línea de productos lanzada en mayo. Sin embargo, los costos de materia prima también aumentaron un 8%, lo que impactó ligeramente el margen neto. Se recomienda una revisión de la cadena de suministro para optimizar costos y maximizar la rentabilidad en el próximo período fiscal. La inversión en tecnología ha sido clave para la eficiencia operativa.",
                "source": "reporte_trimestral_q3.pdf",
                "page_num": 23,
                "score": 0.95,
                "full_document_text": "Informe Trimestral Q3 2023\\n\\nIntroducción: Este documento presenta los resultados financieros consolidados...\\n\\nAnálisis de Rendimiento: El análisis de flujo de caja para el tercer trimestre muestra un incremento del 15% en los ingresos operativos...\\n\\nConclusión: A pesar del aumento en los costos, la perspectiva para el Q4 es positiva..."
              }
            ]

            **Salida JSON:**
        `;

        try {
            const jsonString = await callGeminiAPI(prompt);
            // Limpiar la respuesta por si Gemini añade markdown
            const cleanedJsonString = jsonString.replace(/```json\n|```/g, '').trim();
            const fragments = JSON.parse(cleanedJsonString);
            // Asegurarnos de que devuelve un array
            if (Array.isArray(fragments)) {
                // Guardar el contenido completo de cada archivo en nuestro sistema virtual
                fragments.forEach(function(fragment) {
                    virtualFileSystem[fragment.source] = fragment.full_document_text;
                });
                return fragments;
            }
            throw new Error("La respuesta de Gemini no es un array JSON válido.");
        } catch (error) {
            console.error("Error al generar fragmentos con Gemini:", error);
            // Si Gemini falla, volvemos a los datos mock para no romper la demo
            return generateMockChunks(count, true);
        }
    }

    /**
     * (Función de Ayuda para Debug)
     * Llama a la API de Google para listar los modelos disponibles para tu API Key.
     * Para usarla, abre la consola del desarrollador en tu navegador (F12) y escribe: listAvailableModels()
     */
    window.listAvailableModels = async function() {
        if (GEMINI_API_KEY === 'TU_API_KEY_DE_GEMINI_AQUI') {
            console.error("API Key de Gemini no configurada.");
            return;
        }
        const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
        try {
            const response = await fetch(listModelsUrl);
            const data = await response.json();
            console.log("--- Modelos Disponibles para tu API Key ---");
            const contentModels = data.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
            console.table(contentModels.map(m => ({ name: m.name, description: m.description, version: m.version })));
            console.log("Copia el 'name' de uno de estos modelos y pégalo en la constante GEMINI_API_URL en el archivo script.js si 'gemini-pro' sigue fallando.");
        } catch (error) {
            console.error("Error al listar los modelos:", error);
        }
    }

    async function simulateApiChat(payload) {
        console.log("Simulando API con payload:", payload);
        const { stage, message, smart_prompt, search_mode, show_process, chunks } = payload;
        const delay = (ms) => new Promise(res => setTimeout(res, ms));

        // --- Etapa 1: initial_prompt ---
        if (stage === 'initial_prompt') {
            const startTime = Date.now();
            await delay(smart_prompt ? 1500 : 200); // Simular llamada a LLM
            const duration = (Date.now() - startTime) / 1000;

            const options = smart_prompt
                ? [`Análisis detallado de ${message}`, `Resumen de ${message}`, `Buscar documentos sobre ${message}`, `Pregunta original: ${message}`]
                : [`Buscar exhaustivamente el tema: ${message}`, `Listar todos los documentos que mencionan: ${message}`, `Pregunta original: ${message}`];

            return {
                next_stage: "select_prompt_option",
                response_type: "prompt_options",
                data: options,
                duration: duration
            };
        }

        // --- Etapa 2: execute_search ---
        if (stage === 'execute_search') {
            const total_start_time = Date.now();
            let steps_log = [];

            if (search_mode === 'detallada') {
                // Búsqueda Híbrida con Re-ranking
                const step_start_time = Date.now();
                await delay(2500); // Simular búsqueda y reranking
                const reranked_results = await generateFragmentsWithGemini(message, 5);
                steps_log.push({
                    step: "Búsqueda Híbrida y Re-ranking (Simulado)",
                    duration: (Date.now() - step_start_time) / 1000,
                    results: reranked_results
                });

                if (!show_process) {
                    const step_2_start_time = Date.now();
                    await delay(2000); // Simular LLM
                    const final_response = await generateRealLLMResponse(reranked_results, message);
                    steps_log.push({
                        step: "Generación LLM (Simulado)",
                        duration: (Date.now() - step_2_start_time) / 1000
                    });
                    return {
                        next_stage: "final_response",
                        response_type: "final_answer",
                        data: final_response,
                        intermediate_steps: steps_log,
                        total_duration: (Date.now() - total_start_time) / 1000
                    };
                }

                return {
                    next_stage: "confirm_llm_generation",
                    response_type: "detailed_steps",
                    data: steps_log,
                    query: message,
                    total_duration: (Date.now() - total_start_time) / 1000
                };
            }
            // Búsqueda Rápida
            else {
                const step_1_start_time = Date.now();
                await delay(800);
                const metadata_results = await generateFragmentsWithGemini(message, 3);
                steps_log.push({
                    step: "Búsqueda Vectorial en Milvus (Simulado)",
                    duration: (Date.now() - step_1_start_time) / 1000,
                    results: metadata_results
                });

                const step_2_start_time = Date.now();
                await delay(1500);
                const final_response = await generateRealLLMResponse(metadata_results, message);
                steps_log.push({
                    step: "Generación LLM (Simulado)",
                    duration: (Date.now() - step_2_start_time) / 1000
                });

                return {
                    next_stage: "final_response",
                    response_type: "final_answer",
                    data: final_response,
                    intermediate_steps: steps_log,
                    total_duration: (Date.now() - total_start_time) / 1000
                };
            }
        }

        // --- Etapa 3: generate_final_answer o follow_up_question ---
        if (stage === 'generate_final_answer' || stage === 'follow_up_question') {
            const start_time = Date.now();
            await delay(2000);
            const final_response = await generateRealLLMResponse(chunks, message, stage === 'follow_up_question');
            return {
                next_stage: "final_response",
                response_type: "final_answer",
                data: final_response,
                total_duration: (Date.now() - start_time) / 1000,
                chunks_for_follow_up: chunks
            };
        }

        return { response_type: 'error', data: 'Etapa de simulación no reconocida.' };
    }

    function handleBotResponse(response) {
        conversationState.stage = response.next_stage;
        conversationState.query = response.query || conversationState.query;
        conversationState.chunks = response.chunks_for_follow_up || conversationState.chunks;

        var content = '';
        var duration = response.duration || response.total_duration;
        var durationText = duration ? '<span class="step-duration">(' + duration.toFixed(2) + 's)</span>' : '';

        switch (response.response_type) {
            case 'prompt_options':
                var optionsHtml = '';
                response.data.forEach(function(option) {
                    optionsHtml += '<button data-option="' + option + '">' + option + '</button>';
                });
                content = 'He analizado tu pregunta. ' + durationText + '<div class="options-list">' + optionsHtml + '</div>';
                break;

            case 'detailed_steps':
                var stepsHtml = '';
                response.data.forEach(function(step) {
                    stepsHtml += '<p class="step-header"><strong>' + step.step + '</strong> (' + step.duration.toFixed(2) + 's)</p>';
                    stepsHtml += '<div class="results-container">';
                    step.results.forEach(function(res) {
                        var cleanContent = String(res.content).replace(/</g, "&lt;").replace(/>/g, "&gt;");
                        var sourceText = 'Fuente: ' + res.source.split('\\').pop() + ' (Pág: ' + res.page_num + ', Score: ' + res.score + ')';
                        var sourceLink = '<a href="#" data-source="' + res.source + '" class="source-link virtual-file-link">' + sourceText + '</a>';
                        var refineBtn = '<button class="refine-search-btn" title="Buscar documentos relacionados a este fragmento" ' +
                                        'data-content="' + encodeURIComponent(res.content) + '" ' +
                                        'data-source="' + res.source + '">🎯</button>';
                        stepsHtml += '<div class="result-item">' +
                                     '<div class="result-header">' + refineBtn + '<div class="result-source">' + sourceLink + '</div></div>' +
                                     '<div class="result-content">' + cleanContent + '</div>' +
                                     '</div>';
                    });
                    stepsHtml += '</div>';
                });
                content = '<h3>Proceso de Búsqueda Detallada: ' + durationText + '</h3>' + stepsHtml;
                content += '<p>¿Deseas continuar y generar una respuesta con el LLM basado en estos resultados?</p>';
                content += '<button id="confirm-llm-gen" class="btn-primary">Sí, generar respuesta</button>' +
                           '<button id="cancel-llm-gen" class="btn-secondary">No, nueva consulta</button>';
                conversationState.chunks = response.data[response.data.length - 1].results;
                break;

            case 'final_answer':
                var finalAnswerText = response.data;
                content = finalAnswerText.replace(/\n/g, '<br>');
                if (document.getElementById('mostrar-proceso').checked && response.intermediate_steps && response.intermediate_steps.length > 0) {
                    var processHtml = '<br><br><h4>Proceso Detallado:</h4><ul class="process-list">';
                    response.intermediate_steps.forEach(function(step) {
                        processHtml += '<li>' + step.step + ' (' + step.duration.toFixed(2) + 's)</li>';
                    });
                    processHtml += '</ul>';
                    content += processHtml;
                }
                if (duration) {
                    content += '<div class="total-duration">Operación completada en ' + duration.toFixed(2) + 's</div>';
                }
                content += '<div class="follow-up-options">' +
                           '<button id="follow-up-question" class="btn-secondary">Preguntar sobre este contexto</button>' +
                           '<button id="generate-report" class="btn-secondary" data-answer="' + encodeURIComponent(finalAnswerText) + '">Generar Informe</button>' +
                           '<button id="new-query" class="btn-secondary">Hacer una nueva consulta</button>' +
                           '</div>';
                break;

            default:
                content = 'Respuesta desconocida del sistema.';
        }

        updateLastBotMessage(content);
    }

    function resetConversation() {
        console.log("Reiniciando conversación...");
        conversationState.stage = 'initial_prompt';
        conversationState.query = '';
        conversationState.chunks = [];
        updateLastBotMessage('Ok, he reiniciado la conversación. ¿Cuál es tu nueva consulta?');
        userInput.value = '';
        userInput.focus();
    }

    // --- Funciones de UI y Timers ---

    function startLiveTimer() {
        appendMessage('', 'bot-message', true);
        var startTime = Date.now();
        var timerElement = chatWindow.querySelector('.bot-message:last-child .content');
        
        if (timerElement) {
            timerElement.innerHTML = '<div class="loading-dots"><span>.</span><span>.</span><span>.</span> (0.0s)</div>';
            operationTimer = setInterval(function() {
                var elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
                timerElement.innerHTML = '<div class="loading-dots"><span>.</span><span>.</span><span>.</span> (' + elapsedTime + 's)</div>';
            }, 100);
        }
    }

    function stopLiveTimer() {
        if (operationTimer) {
            clearInterval(operationTimer);
            operationTimer = null;
        }
    }

    function appendMessage(text, className, isLoading) {
        if (isLoading === void 0) { isLoading = false; }
        var messageDiv = document.createElement('div');
        messageDiv.classList.add('message', className);
        var contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
        if (isLoading) {
            contentDiv.innerHTML = '<div class="loading-dots"><span>.</span><span>.</span><span>.</span></div>';
        } else {
            contentDiv.innerHTML = text;
        }
        messageDiv.appendChild(contentDiv);
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function updateLastBotMessage(htmlContent) {
        var lastMessage = chatWindow.querySelector('.bot-message:last-child .content');
        if (lastMessage) {
            lastMessage.innerHTML = htmlContent;
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    }

    userInput.addEventListener('input', function() {
        userInput.style.height = 'auto';
        userInput.style.height = (userInput.scrollHeight) + 'px';
    });

    // --- FUNCIONES DE SIMULACIÓN DE DATOS ---
    function generateMockChunks(count, isReranked) {
        const fileTypes = ['informe_anual.pdf', 'politicas_internas.docx', 'minuta_reunion.txt', 'presentacion_resultados.pptx'];
        const results = [];
        for (let i = 0; i < count; i++) {
            const score = isReranked ? (Math.random() * 2 + 7).toFixed(2) : (Math.random() * 0.2 + 0.75).toFixed(4);
            results.push({
                score: score,
                rerank_score: isReranked ? score : undefined,
                page_num: Math.floor(Math.random() * 50) + 1,
                source: 'C:\\Demo\\Archivos\\' + fileTypes[Math.floor(Math.random() * fileTypes.length)],
                content: `Este es un fragmento de texto simulado número ${i + 1}. Contiene información relevante sobre la consulta y proviene de un documento de demostración. El contenido aquí es genérico para ilustrar la funcionalidad.`
            });
        }
        return results.sort((a, b) => b.score - a.score);
    }

    /**
     * Construye un prompt y llama a la API de Gemini para generar una respuesta real.
     * @param {Array} chunks Los fragmentos de contexto simulados.
     * @param {string} query La pregunta del usuario.
     * @param {boolean} isFollowUp Indica si es una pregunta de seguimiento.
     * @returns {Promise<string>} La respuesta generada por Gemini.
     */
    async function generateRealLLMResponse(chunks, query, isFollowUp = false) {
        if (!chunks || chunks.length === 0) {
            return "No he podido encontrar información relevante para responder a tu pregunta.";
        }

        // Construir el contexto a partir de los chunks simulados
        const contextString = chunks.map(chunk => 
            `Fuente: ${chunk.source.split('\\').pop()} (Página: ${chunk.page_num})\nContenido: ${chunk.content}`
        ).join('\n\n---\n\n');

        const prompt = `
            **Tarea:**
            Eres un asistente de IA. Tu objetivo es responder la pregunta del usuario basándote únicamente en el contexto de documentos proporcionado. La respuesta debe ser en español.

            **Instrucciones:**
            1. Basa tu respuesta exclusivamente en la información del contexto.
            2. Si la respuesta no se encuentra en el contexto, responde: "La información no se encuentra en los documentos proporcionados."
            3. Cita las fuentes ('Fuente: ...') que utilizaste para tu respuesta.

            **Contexto de Documentos:**
            ${contextString}

            **Pregunta del usuario:**
            "${query}"

            **Respuesta:**
        `;

        // Llamar a la API real de Gemini
        return await callGeminiAPI(prompt);
    }

    /**
     * Renderiza un gráfico en un elemento canvas dentro del chat.
     * @param {string} canvasId El ID del elemento <canvas>.
     * @param {object} chartConfig La configuración del gráfico para Chart.js.
     */
    function renderChartInChat(canvasId, chartConfig) {
        // Pequeño retraso para asegurar que el DOM se haya actualizado.
        setTimeout(() => {
            const ctx = document.getElementById(canvasId);
            if (ctx) {
                // Añadimos opciones por defecto para que los gráficos se vean bien en el tema oscuro.
                const defaultConfig = {
                    options: { plugins: { legend: { labels: { color: 'white' } } }, scales: { x: { ticks: { color: 'white' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }, y: { ticks: { color: 'white' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } } } }
                };
                // Fusionamos la configuración por defecto con la recibida de Gemini.
                const finalConfig = { ...chartConfig, options: { ...defaultConfig.options, ...chartConfig.options } };
                new Chart(ctx.getContext('2d'), finalConfig);
            }
        }, 100);
    }
    /**
     * Usa Gemini para generar un informe simulado basado en una respuesta.
     * @param {string} answerText El texto de la respuesta final.
     */
    async function generateSimulatedReport(answerText) {
        startLiveTimer();

        const prompt = `
        **Tarea:**
        Actúa como un analista de datos. Tu objetivo es generar un informe en formato Markdown basado en el texto proporcionado. Si es posible, genera también la configuración para un gráfico.

        **Instrucciones:**
        1.  Analiza el siguiente texto.
        2.  Si el texto contiene datos numéricos, financieros o comparativos, genera una **tabla en formato Markdown** que resuma esos datos.
        3.  Si el texto es principalmente descriptivo o conceptual, crea un **resumen ejecutivo** con 3-4 puntos clave (bullet points).
        4.  **Generación de Gráfico (MUY IMPORTANTE):** Si los datos se pueden visualizar (comparaciones, tendencias, proporciones), genera un bloque de código JSON para Chart.js.
            - El JSON debe estar envuelto en un bloque especial: \`[CHART_JSON]...[/CHART_JSON]\`.
            - El JSON debe contener las claves: \`type\` (ej. 'bar', 'line', 'pie'), y \`data\` (con \`labels\` y \`datasets\`).
            - Ejemplo de bloque JSON:
              \`\`\`
              [CHART_JSON]
              {
                "type": "bar",
                "data": {
                  "labels": ["Q1", "Q2", "Q3"],
                  "datasets": [{
                    "label": "Ingresos (en millones)",
                    "data": [10, 15, 12],
                    "backgroundColor": ["#889AFF", "#5767D9", "#3E4EAD"]
                  }]
                }
              }
              [/CHART_JSON]
              \`\`\`
        5.  El informe debe ser conciso y claro. Primero el texto/tabla en Markdown, y luego, si aplica, el bloque JSON del gráfico.

        **Texto a analizar:**\n---\n${answerText}\n---\n\n**Informe Generado:**
        `;

        try {
            const reportMarkdown = await callGeminiAPI(prompt);
            // Usaremos una librería externa o una función para convertir Markdown a HTML si es necesario,
            // pero por ahora, el navegador puede renderizar <pre> para mantener el formato.
            // Para una mejor visualización de tablas, se necesitarían estilos CSS.
            let reportHtml = '<h3>Informe Generado</h3>';
            let textPart = reportMarkdown;
            let chartConfig = null;

            const chartJsonRegex = /\[CHART_JSON\]([\s\S]*?)\[\/CHART_JSON\]/;
            const match = reportMarkdown.match(chartJsonRegex);

            if (match && match[1]) {
                try {
                    chartConfig = JSON.parse(match[1].trim());
                    textPart = reportMarkdown.replace(chartJsonRegex, '').trim(); // Quita el JSON del texto
                    const canvasId = 'chart-' + Date.now();
                    reportHtml += `<div class="chat-chart-container"><canvas id="${canvasId}"></canvas></div>`;
                    renderChartInChat(canvasId, chartConfig);
                } catch (e) { console.error("Error al parsear el JSON del gráfico:", e); }
            }
            reportHtml += '<div class="report-content">' + textPart.replace(/\|/g, ' | ').replace(/\n/g, '<br>') + '</div>';
            stopLiveTimer();
            updateLastBotMessage(reportHtml);
        } catch (error) {
            console.error("Error al generar el informe simulado:", error);
            stopLiveTimer();
            updateLastBotMessage("Lo siento, ocurrió un error al intentar generar el informe.");
        }
    }
});