// Configuration
const SNAPLOGIC_API_URL = "https://emea.snaplogic.com/api/1/rest/slsched/feed/ConnectFasterInc/snapLogic4snapLogic/AutoRFPAgent/chrome_extension_api";
const SNAPLOGIC_API_TOKEN = "BEARER_TOKEN";

// State
let rfpContent = null;
let questions = [];
let answers = [];
let isProcessing = false;
let processingCount = 0;

// ============================================================================
// State Management
// ============================================================================

async function loadState() {
  try {
    const result = await chrome.storage.local.get(['rfpContent', 'questions', 'answers']);
    if (result.rfpContent) {
      rfpContent = result.rfpContent;
      questions = result.questions || [];
      answers = result.answers || [];
      
      if (questions.length > 0) {
        displayAllQuestions(questions);
        updateProgress(answers.filter(a => a).length, questions.length);
        showProgressUI();
        
        if (answers.filter(a => a).length === questions.length) {
          document.getElementById('exportBtn').style.display = 'block';
        }
      }
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

async function saveState() {
  try {
    await chrome.storage.local.set({
      rfpContent: rfpContent,
      questions: questions,
      answers: answers
    });
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

async function clearState() {
  try {
    await chrome.storage.local.remove(['rfpContent', 'questions', 'answers']);
    rfpContent = null;
    questions = [];
    answers = [];
    resetUI();
  } catch (error) {
    console.error('Error clearing state:', error);
  }
}

// ============================================================================
// API Calls
// ============================================================================

async function callSnapLogicAPI(action, payload) {
  const response = await fetch(SNAPLOGIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SNAPLOGIC_API_TOKEN}`
    },
    body: JSON.stringify({
      action: action,
      ...payload
    })
  });

  if (!response.ok) {
    throw new Error(`SnapLogic API error: ${response.status}`);
  }

  return await response.json();
}

async function extractQuestionsWithSnapLogic(content) {
  const data = await callSnapLogicAPI('extract_questions', {
    content: content.substring(0, 20000)
  });
  
  // Handle different response formats
  if (Array.isArray(data) && data.length > 0 && data[0].content) {
    return data[0].content;
  } else if (data.content && Array.isArray(data.content)) {
    return data.content;
  }
  
  return data;
}

async function generateAnswer(question) {
  processingCount++;
  if (processingCount === 1) {
    showProcessing('Asking the magic 8-ball...');
  }
  
  try {
    const data = await callSnapLogicAPI('answer_question', { question });
    
    // Handle different response formats
    if (Array.isArray(data) && data.length > 0 && data[0].response) {
      return data[0].response;
    } else if (data.answer) {
      return data.answer;
    }
    
    return data.response || JSON.stringify(data);
  } finally {
    processingCount--;
    if (processingCount === 0) {
      removeProcessing();
    }
  }
}

// ============================================================================
// Content Extraction
// ============================================================================

function extractRFPContent() {
  function getTextUntilNextHeading(heading) {
    let text = '';
    let next = heading.nextElementSibling;
    while (next && !next.matches('h1, h2, h3, h4, h5, h6')) {
      text += next.innerText + '\n';
      next = next.nextElementSibling;
    }
    return text.trim();
  }
  
  return {
    title: document.title,
    url: window.location.href,
    fullText: document.body.innerText,
    sections: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
      heading: h.innerText,
      level: h.tagName,
      content: getTextUntilNextHeading(h)
    }))
  };
}

// ============================================================================
// UI Functions
// ============================================================================

function formatMarkdownToHTML(text) {
  return text
    .replace(/### (.*?)(\n|$)/g, '<strong>$1</strong><br>')
    .replace(/## (.*?)(\n|$)/g, '<strong>$1</strong><br>')
    .replace(/# (.*?)(\n|$)/g, '<strong>$1</strong><br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function updateProgress(current, total) {
  const progressBar = document.getElementById('progressBar');
  const percentage = (current / total) * 100;
  progressBar.style.width = `${percentage}%`;
  
  document.getElementById('totalQuestions').textContent = total;
  document.getElementById('answeredQuestions').textContent = current;
}

function showProgressUI() {
  document.getElementById('progressContainer').style.display = 'block';
  document.getElementById('stats').style.display = 'flex';
  document.getElementById('answerAllBtn').style.display = 'block';
}

function resetUI() {
  const container = document.getElementById('resultsContainer');
  container.innerHTML = `
    <div class="empty-state">
      <img src="https://pbs.twimg.com/profile_images/1676693069863997440/KBpJem3z_400x400.png" 
           alt="SnapLogic" 
           style="width: 80px; height: 80px; margin-bottom: 16px; opacity: 0.5;">
      <p><strong>Ready to process your RFX document</strong></p>
      <p>Click "Extract Questions from Webpage" to begin</p>
    </div>
  `;
  document.getElementById('progressContainer').style.display = 'none';
  document.getElementById('stats').style.display = 'none';
  document.getElementById('exportBtn').style.display = 'none';
  document.getElementById('answerAllBtn').style.display = 'none';
  updateProgress(0, 0);
}

function displayAllQuestions(questions) {
  const container = document.getElementById('resultsContainer');
  container.innerHTML = '';
  
  questions.forEach((q, index) => {
    const qaDiv = document.createElement('div');
    qaDiv.id = `qa-${index}`;
    qaDiv.className = 'question-answer';
    
    const answer = answers[index];
    let answerContent;
    
    if (answer) {
      const formattedAnswer = formatMarkdownToHTML(answer.answer);
      answerContent = `<div class="answer">${formattedAnswer}</div>`;
    } else {
      answerContent = `
        <div class="answer" style="padding: 0; background: transparent;">
          <button class="answer-btn" data-index="${index}">
            Answer Question
          </button>
        </div>`;
    }
    
    qaDiv.innerHTML = `
      <div class="question">Q${index + 1}: ${q.question}</div>
      ${answerContent}
    `;
    container.appendChild(qaDiv);
  });
  
  // Attach event listeners to answer buttons
  document.querySelectorAll('.answer-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      await answerSingleQuestion(index);
    });
  });
}

function showProcessing(message) {
  const container = document.getElementById('resultsContainer');
  let processingDiv = document.getElementById('processingIndicator');
  
  if (!processingDiv) {
    processingDiv = document.createElement('div');
    processingDiv.className = 'processing';
    processingDiv.id = 'processingIndicator';
    container.insertBefore(processingDiv, container.firstChild);
  }
  
  processingDiv.innerHTML = `
    <div class="spinner"></div>
    <span>${message}</span>
  `;
}

function removeProcessing() {
  const indicator = document.getElementById('processingIndicator');
  if (indicator) indicator.remove();
}

function showError(message) {
  const container = document.getElementById('resultsContainer');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error';
  errorDiv.textContent = `Error: ${message}`;
  container.insertBefore(errorDiv, container.firstChild);
  setTimeout(() => errorDiv.remove(), 5000);
}

function showSuccess(message) {
  const container = document.getElementById('resultsContainer');
  const successDiv = document.createElement('div');
  successDiv.className = 'success';
  successDiv.textContent = message;
  container.insertBefore(successDiv, container.firstChild);
  setTimeout(() => successDiv.remove(), 5000);
}

// ============================================================================
// Core Processing Functions
// ============================================================================

async function answerSingleQuestion(index) {
  const q = questions[index];
  const btn = document.querySelector(`[data-index="${index}"]`);
  
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Answering...';
  }
  
  try {
    const answer = await generateAnswer(q.question);
    
    answers[index] = {
      question: q.question,
      answer: answer,
      section: q.section,
      priority: q.priority
    };
    
    await saveState();
    
    // Update the specific answer in the UI
    const qaDiv = document.getElementById(`qa-${index}`);
    if (qaDiv) {
      const formattedAnswer = formatMarkdownToHTML(answer);
      const answerDiv = qaDiv.querySelector('.answer');
      answerDiv.innerHTML = formattedAnswer;
      answerDiv.style.padding = '16px';
      answerDiv.style.background = '#f8fafc';
    }
    
    const answeredCount = answers.filter(a => a).length;
    updateProgress(answeredCount, questions.length);
    
    if (answeredCount === questions.length) {
      document.getElementById('exportBtn').style.display = 'block';
      showSuccess('All questions answered!');
    }
    
  } catch (error) {
    console.error(`Error answering question ${index + 1}:`, error);
    showError(error.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
  }
}

async function answerAllQuestions() {
  const answerAllBtn = document.getElementById('answerAllBtn');
  answerAllBtn.disabled = true;
  answerAllBtn.textContent = 'Answering all questions...';
  
  showProcessing('Sending all questions to SnapLogic in parallel...');
  
  // Process all unanswered questions in parallel
  const promises = questions.map((q, index) => {
    if (!answers[index]) {
      return answerSingleQuestion(index);
    }
    return Promise.resolve();
  });
  
  try {
    await Promise.all(promises);
    removeProcessing();
    showSuccess('All questions answered!');
  } catch (error) {
    removeProcessing();
    showError('Some questions failed to answer');
  } finally {
    answerAllBtn.disabled = false;
    answerAllBtn.textContent = 'Answer All Questions';
  }
}

async function processRFP() {
  if (isProcessing) return;
  
  isProcessing = true;
  const startBtn = document.getElementById('startBtn');
  startBtn.disabled = true;
  startBtn.textContent = 'Processing...';
  
  document.getElementById('resultsContainer').innerHTML = '';
  showProgressUI();
  
  try {
    // Extract content from webpage
    showProcessing('Extracting content from webpage...');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractRFPContent
    });
    
    rfpContent = results[0].result;
    removeProcessing();
    
    // Extract questions using SnapLogic
    showProcessing('Rotating the tires...');
    questions = await extractQuestionsWithSnapLogic(rfpContent.fullText);
    removeProcessing();
    
    showSuccess(`Found ${questions.length} questions`);
    
    answers = new Array(questions.length).fill(null);
    updateProgress(0, questions.length);
    displayAllQuestions(questions);
    
    await saveState();
    
  } catch (error) {
    console.error('Error processing RFP:', error);
    removeProcessing();
    showError(error.message);
  } finally {
    isProcessing = false;
    startBtn.disabled = false;
    startBtn.textContent = 'Extract Questions from Webpage';
  }
}

function exportAnswers() {
  const exportData = {
    rfp_title: rfpContent.title,
    rfp_url: rfpContent.url,
    processed_date: new Date().toISOString(),
    questions_answered: answers.filter(a => a).length,
    answers: answers.filter(a => a)
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rfp-responses-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showSuccess('Answers exported successfully!');
}

async function handleCustomQuery() {
  const query = document.getElementById('customQuery').value.trim();
  if (!query) {
    showError('Please enter a question');
    return;
  }
  
  const btn = document.getElementById('sendCustomBtn');
  btn.disabled = true;
  btn.textContent = 'Processing...';
  
  // Show loading indicator
  const customTab = document.getElementById('customTab');
  let customLoading = document.createElement('div');
  customLoading.className = 'processing';
  customLoading.id = 'customLoading';
  customLoading.innerHTML = '<div class="spinner"></div><span>Milking the cows...</span>';
  customTab.appendChild(customLoading);
  
  try {
    const data = await callSnapLogicAPI('answer_question', { question: query });
    
    // Handle different response formats
    let formattedAnswer = data;
    if (Array.isArray(data) && data.length > 0 && data[0].response) {
      formattedAnswer = data[0].response;
    } else if (data.answer) {
      formattedAnswer = data.answer;
    }
    
    customLoading.remove();
    
    // Display result
    const container = document.getElementById('resultsContainer');
    const resultDiv = document.createElement('div');
    resultDiv.className = 'question-answer';
    
    const htmlAnswer = formatMarkdownToHTML(formattedAnswer);
    
    resultDiv.innerHTML = `
      <div class="question">Custom Query: ${query}</div>
      <div class="answer">${htmlAnswer}</div>
    `;
    container.insertBefore(resultDiv, container.firstChild);
    
    showSuccess('Query completed');
    document.getElementById('customQuery').value = '';
    
  } catch (error) {
    if (customLoading) customLoading.remove();
    showError(error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Custom Query';
  }
}

// ============================================================================
// Event Listeners
// ============================================================================

document.getElementById('startBtn').addEventListener('click', processRFP);
document.getElementById('exportBtn').addEventListener('click', exportAnswers);
document.getElementById('answerAllBtn').addEventListener('click', answerAllQuestions);
document.getElementById('sendCustomBtn').addEventListener('click', handleCustomQuery);

document.getElementById('clearBtn').addEventListener('click', async () => {
  if (confirm('Clear all saved progress? This cannot be undone.')) {
    await clearState();
  }
});

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.getAttribute('data-tab');
    
    // Update active tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update active content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(targetTab + 'Tab').classList.add('active');
  });
});

// ============================================================================
// Initialize
// ============================================================================

(async function init() {
  await loadState();
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      document.getElementById('startBtn').disabled = true;
      showError('Cannot process Chrome system pages');
    }
  } catch (error) {
    console.error('Initialization error:', error);
  }
})();
