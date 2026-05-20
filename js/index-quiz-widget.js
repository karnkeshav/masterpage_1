  window.currentCurriculum = null;
  window.currentBoard = '';
  window.currentDifficulty = 'Simple';
  window.loadedSubjectsData = null;

  window.selectBoard = function(board, btnElem) {
      document.querySelectorAll('.board-btn').forEach(b => b.dataset.selected = 'false');
      btnElem.dataset.selected = 'true';
      window.currentBoard = board;

      const classSel = document.getElementById('class-select');
      const subjSel = document.getElementById('subject-select');
      const chapSel = document.getElementById('chapter-select');
      const startBtn = document.getElementById('start-quiz-btn');

      // Reset
      classSel.innerHTML = '<option value="">Select Class...</option>';
      subjSel.innerHTML = '<option value="">Select Class first...</option>';
      chapSel.innerHTML = '<option value="">Select Subject first...</option>';
      classSel.disabled = true;
      subjSel.disabled = true;
      chapSel.disabled = true;
      startBtn.disabled = true;

      if (board === 'CBSE') {
          [6,7,8,9,10,11,12].forEach(c => {
              classSel.innerHTML += `<option value="${c}">Class ${c}</option>`;
          });
          classSel.disabled = false;
      } else if (board === 'SCERT') {
          classSel.innerHTML += `<option value="9">Class 9</option>`;
          classSel.disabled = false;
      }
  }

  window.loadSubjects = async function() {
      const grade = document.getElementById('class-select').value;
      const subjSel = document.getElementById('subject-select');
      const chapSel = document.getElementById('chapter-select');

      subjSel.innerHTML = '<option value="">Loading...</option>';
      subjSel.disabled = true;
      chapSel.innerHTML = '<option value="">Select Subject first...</option>';
      chapSel.disabled = true;
      document.getElementById('start-quiz-btn').disabled = true;

      if (!grade) {
          subjSel.innerHTML = '<option value="">Select Class first...</option>';
          return;
      }

      try {
          if (window.currentBoard === 'SCERT') {
              const module = await import('../scert/telangana-9/js/curriculum.js');
              window.loadedSubjectsData = module.curriculum || module.default;
          } else {
              const { loadCurriculum } = await import('./curriculum/loader.js');
              window.loadedSubjectsData = await loadCurriculum(grade);
          }

          subjSel.innerHTML = '<option value="">Select Subject...</option>';
          Object.keys(window.loadedSubjectsData).forEach(subj => {
              subjSel.innerHTML += `<option value="${subj}">${subj}</option>`;
          });
          subjSel.disabled = false;

      } catch (e) {
          console.error(e);
          subjSel.innerHTML = '<option value="">Error loading data</option>';
      }
  }

  window.loadChapters = function() {
      const subj = document.getElementById('subject-select').value;
      const chapSel = document.getElementById('chapter-select');

      chapSel.innerHTML = '<option value="">Select Chapter...</option>';
      chapSel.disabled = true;
      document.getElementById('start-quiz-btn').disabled = true;

      if (!subj || !window.loadedSubjectsData[subj]) return;

      const sections = window.loadedSubjectsData[subj];
      let hasChapters = false;

      Object.keys(sections).forEach(secName => {
          const optGroup = document.createElement('optgroup');
          optGroup.label = secName;

          sections[secName].forEach((chap, idx) => {
              const opt = document.createElement('option');
              // Store table_id and chapter_title as JSON in value to retrieve later
              opt.value = JSON.stringify({ table_id: chap.table_id || "", title: chap.chapter_title });
              opt.textContent = chap.chapter_title;
              optGroup.appendChild(opt);
              hasChapters = true;
          });
          chapSel.appendChild(optGroup);
      });

      if (hasChapters) {
          chapSel.disabled = false;
      }
  }

  window.selectDifficulty = function(diff, btnElem) {
      document.querySelectorAll('.diff-btn').forEach(b => b.dataset.selected = 'false');
      btnElem.dataset.selected = 'true';
      window.currentDifficulty = diff;
  }

  window.checkChapter = function() {
      const chapVal = document.getElementById('chapter-select').value;
      const startBtn = document.getElementById('start-quiz-btn');

      if (!chapVal) {
          startBtn.disabled = true;
          startBtn.innerHTML = '<i class="fas fa-play"></i> Start Quiz';
          return;
      }

      try {
          const chapData = JSON.parse(chapVal);
          if (!chapData.table_id || chapData.table_id.trim() === "") {
              startBtn.disabled = true;
              startBtn.innerHTML = '<i class="fas fa-lock"></i> Coming Soon';
              startBtn.classList.add('opacity-50');
          } else {
              startBtn.disabled = false;
              startBtn.innerHTML = '<i class="fas fa-play"></i> Start Quiz';
              startBtn.classList.remove('opacity-50');
          }
      } catch(e) {
          startBtn.disabled = true;
          startBtn.innerHTML = '<i class="fas fa-play"></i> Start Quiz';
      }
  }

  window.startQuiz = function() {
      const grade = document.getElementById('class-select').value;
      const subj = document.getElementById('subject-select').value;
      const chapVal = document.getElementById('chapter-select').value;

      if (!grade || !subj || !chapVal) return;

      try {
          const chapData = JSON.parse(chapVal);
          const tableId = chapData.table_id;
          const topic = chapData.title; // Do not encode early for the topic to ensure standard format

          if (!tableId || tableId.trim() === "") return;

          // Target URL format:
          // quiz-engine.html?table=${tableId}&topic=${encodeURIComponent(title)}&grade=${grade}&difficulty=${difficulty}&subject=${encodeURIComponent(subject)}
          const targetUrl = `./app/quiz-engine.html?table=${tableId}&topic=${encodeURIComponent(topic)}&grade=${grade}&difficulty=${window.currentDifficulty}&subject=${encodeURIComponent(subj)}&mode=guest`;
          window.location.href = targetUrl;
      } catch (e) {
          console.error("Error starting quiz", e);
      }
  }

  window.handleRequestSubmit = async function(e) {
    e.preventDefault();
    const form    = e.target;
    const btn     = form.querySelector('button[type="submit"]');
    const errDiv  = form.querySelector('#req-error') || (() => {
        const d = document.createElement('p');
        d.id = 'req-error';
        d.style.cssText = 'color:#dc2626;font-size:12px;font-weight:700;text-align:center;margin:0';
        btn.insertAdjacentElement('beforebegin', d);
        return d;
    })();

    const board   = document.getElementById('reqBoard').value.trim();
    const cls     = document.getElementById('reqClass').value.trim();
    const contact = document.getElementById('reqContact').value.trim();

    btn.disabled    = true;
    btn.textContent = 'Sending…';
    errDiv.textContent = '';

    try {
        const res  = await fetch('/api/contact', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ board, cls, contact }),
        });
        const data = await res.json();
        if (!res.ok && !data.success) throw new Error(data.error || 'Submission failed');

        // Replace card content with thank-you message
        const card = form.parentElement;
        card.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 16px;text-align:center;gap:16px;">
            <div style="width:64px;height:64px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:30px;">✅</div>
            <h3 style="font-size:20px;font-weight:900;color:#1a3e6a;margin:0;">Request Received!</h3>
            <p style="font-size:14px;color:#475569;max-width:280px;line-height:1.6;margin:0;">
              Thank you! Our team will get back to you within
              <strong>2 business days</strong> at<br>
              <strong style="color:#1a3e6a;">${contact}</strong>
            </p>
            <div style="font-size:11px;color:#94a3b8;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 16px;margin-top:4px;">
              Board: <strong>${board}</strong>&nbsp;&nbsp;·&nbsp;&nbsp;Class: <strong>${cls}</strong>
            </div>
          </div>`;
    } catch (err) {
        btn.disabled    = false;
        btn.textContent = 'Submit Request';
        errDiv.textContent = err.message || 'Something went wrong — please WhatsApp us directly.';
    }
  };
