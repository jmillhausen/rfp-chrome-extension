// Configuration
const SNAPLOGIC_AI_URL = "https://emea.snaplogic.com/api/1/rest/slsched/feed/ConnectFasterInc/snapLogic4snapLogic/AutoRFPAgent/chrome_extension_api";
const SNAPLOGIC_AI_TOKEN = "KqRkbzVyQAVjV5zaOzBd4tBsHG6AoGBX";
const SNAPLOGIC_KB_URL = "https://emea.snaplogic.com/api/1/rest/slsched/feed/ConnectFasterInc/snapLogic4snapLogic/AutoRFPAgent/ApiRfpAgent";
const SNAPLOGIC_KB_TOKEN = "nNpLBJrd8FAtFh3TVC9xR97QAwWtJHgF";

let rfpContent = null;
let questions = [];
let answers = [];
let isProcessing = false;
let processingCount = 0;

// State management
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
        document.getElementById('progressContainer').style.display = 'block';
        document.getElementById('stats').style.display = 'flex';
        
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
    document.getElementById('resultsContainer').innerHTML = '<div class="empty-state"><img src="https://pbs.twimg.com/profile_images/1676693069863997440/KBpJem3z_400x400.png" alt="SnapLogic" style="width: 80px; height: 80px; margin-bottom: 16px; opacity: 0.5;"><p><strong>Ready to process your RFX document</strong></p><p>Click "Extract Questions from Webpage" to begin</p></div>';
    document.getElementById('progressContainer').style.display = 'none';
    document.getElementById('stats').style.display = 'none';
    document.getElementById('exportBtn').style.display = 'none';
    document.getElementById('answerAllBtn').style.display = 'none';
    updateProgress(0, 0);
  } catch (error) {
    console.error('Error clearing state:', error);
  }
}

// Call SnapLogic Knowledge Base API
async function querySnapLogicKB(question) {
  const response = await fetch(SNAPLOGIC_KB_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SNAPLOGIC_KB_TOKEN}`
    },
    body: JSON.stringify({
      prompt: [question]
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SnapLogic KB error ${response.status}: ${errorText.substring(0, 200)}`);
  }
  
  return await response.json();
}

// Extract RFP content from page
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

// Extract questions using SnapLogic AI
async function extractQuestionsWithSnapLogic(rfpContent) {
  const response = await fetch(SNAPLOGIC_AI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SNAPLOGIC_AI_TOKEN}`
    },
    body: JSON.stringify({
      action: 'extract_questions',
      content: rfpContent.fullText.substring(0, 20000)
    })
  });

  if (!response.ok) {
    throw new Error(`SnapLogic AI error: ${response.status}`);
  }

  const data = await response.json();
  
  // Handle response: [{"content": [...]}] or {"content": [...]}
  if (Array.isArray(data) && data.length > 0 && data[0].content) {
    return data[0].content;
  } else if (data.content && Array.isArray(data.content)) {
    return data.content;
  }
  
  return data;
}

// Generate answer using SnapLogic AI (which queries KB internally)
async function generateAnswer(question) {
  processingCount++;
  if (processingCount === 1) {
    showProcessing(`Asking the magic 8-ball...`);
  }
  
  try {
    const response = await fetch(SNAPLOGIC_AI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SNAPLOGIC_AI_TOKEN}`
      },
      body: JSON.stringify({
        action: 'answer_question',
        question: question
      })
    });

    if (!response.ok) {
      throw new Error(`SnapLogic AI error: ${response.status}`);
    }

    const data = await response.json();
    
    // Handle wrapped response: [{"response": "..."}] or {"answer": "..."}
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

// UI Functions
function updateProgress(current, total) {
  const progressBar = document.getElementById('progressBar');
  const percentage = (current / total) * 100;
  progressBar.style.width = `${percentage}%`;
  
  document.getElementById('totalQuestions').textContent = total;
  document.getElementById('answeredQuestions').textContent = current;
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
      // Convert markdown to HTML formatting
      let formattedAnswer = answer.answer
        .replace(/### (.*?)(\n|$)/g, '<strong>$1</strong><br>')  // ### headers to bold
        .replace(/## (.*?)(\n|$)/g, '<strong>$1</strong><br>')   // ## headers to bold
        .replace(/# (.*?)(\n|$)/g, '<strong>$1</strong><br>')    // # headers to bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')         // **bold** to <strong>
        .replace(/\n\n/g, '<br><br>')                             // double line breaks
        .replace(/\n/g, '<br>');                                  // single line breaks
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
  
  document.querySelectorAll('.answer-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      await answerSingleQuestion(index);
    });
  });
}

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
    
    // Update only this specific answer, don't refresh everything
    const qaDiv = document.getElementById(`qa-${index}`);
    if (qaDiv) {
      const formattedAnswer = answer
        .replace(/### (.*?)(\n|$)/g, '<strong>$1</strong><br>')
        .replace(/## (.*?)(\n|$)/g, '<strong>$1</strong><br>')
        .replace(/# (.*?)(\n|$)/g, '<strong>$1</strong><br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');
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
  
  // Fire off all questions at once in parallel
  const promises = questions.map((q, index) => {
    if (!answers[index]) {
      return answerSingleQuestion(index);
    }
    return Promise.resolve(); // Skip already answered
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

async function processRFP() {
  if (isProcessing) return;
  
  isProcessing = true;
  const startBtn = document.getElementById('startBtn');
  startBtn.disabled = true;
  startBtn.textContent = 'Processing...';
  
  document.getElementById('resultsContainer').innerHTML = '';
  document.getElementById('progressContainer').style.display = 'block';
  document.getElementById('stats').style.display = 'flex';
  
  try {
    // Extract content
    showProcessing('Extracting content from webpage...');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractRFPContent
    });
    
    rfpContent = results[0].result;
    removeProcessing();
    
    // Extract questions
    showProcessing('Rotating the tires...');
    questions = await extractQuestionsWithSnapLogic(rfpContent);
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

// Event listeners
document.getElementById('startBtn').addEventListener('click', processRFP);
document.getElementById('exportBtn').addEventListener('click', exportAnswers);
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

// Custom query
document.getElementById('sendCustomBtn').addEventListener('click', async () => {
  const query = document.getElementById('customQuery').value.trim();
  if (!query) {
    showError('Please enter a question');
    return;
  }
  
  const btn = document.getElementById('sendCustomBtn');
  btn.disabled = true;
  btn.textContent = 'Processing...';
  
  // Create custom query specific loading in the custom tab area
  const customTab = document.getElementById('customTab');
  let customLoading = document.createElement('div');
  customLoading.className = 'processing';
  customLoading.id = 'customLoading';
  customLoading.innerHTML = '<div class="spinner"></div><span>Milking the cows...</span>';
  customTab.appendChild(customLoading);
  
  try {
    const response = await fetch(SNAPLOGIC_AI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SNAPLOGIC_AI_TOKEN}`
      },
      body: JSON.stringify({
        action: 'answer_question',
        question: query
      })
    });

    if (!response.ok) {
      throw new Error(`SnapLogic AI error: ${response.status}`);
    }

    const data = await response.json();
    
    // Handle wrapped response: [{"response": "..."}]
    let formattedAnswer = data;
    if (Array.isArray(data) && data.length > 0 && data[0].response) {
      formattedAnswer = data[0].response;
    } else if (data.answer) {
      formattedAnswer = data.answer;
    }
    
    customLoading.remove();
    
    // Display formatted result in results container
    const container = document.getElementById('resultsContainer');
    const resultDiv = document.createElement('div');
    resultDiv.className = 'question-answer';
    
    // Convert markdown to HTML
    const htmlAnswer = formattedAnswer
      .replace(/### (.*?)(\n|$)/g, '<strong>$1</strong><br>')
      .replace(/## (.*?)(\n|$)/g, '<strong>$1</strong><br>')
      .replace(/# (.*?)(\n|$)/g, '<strong>$1</strong><br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
    
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
});

// Initialize
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
