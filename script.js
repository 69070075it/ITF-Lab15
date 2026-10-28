/* =====================================================================
   script.js — โมดูลเชื่อมต่อกับ index.html (การ์ดโปรไฟล์ + To-do List)
   ไฟล์คู่กัน : C:\Users\Joseph\Documents\itf-week14-ai\index.html
   เรียกใช้ผ่าน : <script src="script.js" defer></script> ท้าย <body>
   ---------------------------------------------------------------------
   เป้าหมาย (Goal)
   1. เปลี่ยน To-do List จาก "ต้องแก้ HTML ด้วยมือ" ให้เพิ่ม / ติ๊ก / ลบ / แก้ไข ได้จริง
   2. เชื่อมโยงกับ index.html ผ่าน id / class ที่กำหนดไว้ (สัญญา DOM)
   3. บันทึกสถานะงานลง localStorage เพื่อไม่ให้ข้อมูลหายเมื่อรีเฟรชหน้า
   4. JavaScript ล้วน (vanilla) — ไม่ใช้ framework / CDN ใด ๆ

   ข้อกำหนด (Requirements)
   - เปิด index.html โดยตรง (file://) ต้องไม่พัง → ครอบ localStorage ด้วย try/catch
   - คงหน้าตาเดิมของ index.html (โทนขาว-เทา, การ์ดซ้าย-ขวา, responsive)
   - แยกชั้นงานชัดเจน: ข้อมูล / การแสดงผล / การกระทำ / เหตุการณ์
   - รองรับคีย์บอร์ด: Enter เพิ่มงาน, Enter ยืนยันการแก้ไข, Esc ยกเลิกการแก้ไข
   - ลบรายการได้ พร้อมปุ่ม "ย้อนกลับ" (undo) ใน toast

   โครงสร้าง (Structure)
   1) CONFIG & STATE  – ค่าคงที่, ตัวแปรสถานะ, ตัวช่วยเล็ก ๆ
   2) STORAGE LAYER   – อ่าน / เขียน localStorage (มี fallback เมื่อใช้ไม่ได้)
   3) RENDER LAYER    – สร้างรายการงาน, วาดรายการทั้งหมด, อัปเดตตัวนับ
   4) ACTION LAYER    – เพิ่ม / ติ๊กเสร็จ / ลบ(undo) / แก้ไข / ล้างรายการ
   5) EVENT LAYER     – ผูกเหตุการณ์ (click, change, dblclick, keydown)
   6) INIT            – จุดเริ่มต้นของแอป

   การทำงาน (Operation)
   1. DOMContentLoaded → เก็บ reference ของ element ที่ต้องใช้
   2. โหลดข้อมูล: ถ้ามีใน localStorage ใช้ของเดิม / ถ้าไม่มีให้ดึงรายการใน HTML
      เดิมมาเป็นค่าเริ่มต้นแล้วบันทึกกลับ
   3. render() วาดรายการทั้งหมด + อัปเดตสถิติ
   4. ผูก event ให้ผู้ใช้โต้ตอบได้ทันที
   5. ทุกการเปลี่ยนแปลง → บันทึกกลับลง localStorage
   ===================================================================== */

(function () {
  'use strict';

  /* ---------- 1) CONFIG & STATE ---------------------------------- */

  var STORAGE_KEY = 'itf14.todo.v1';
  var UNDO_TIMEOUT = 5000;

  var els = {};
  var todos = [];          // [{ id, text, done }]
  var pendingDelete = null;
  var undoTimer = null;

  function $(sel) { return document.querySelector(sel); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- 2) STORAGE LAYER ----------------------------------- */

  function storageAvailable() {
    try {
      var k = '__itf_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var canStore = storageAvailable();

  function loadTodos() {
    if (canStore) {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed
              .filter(function (t) { return t && typeof t.text === 'string'; })
              .map(function (t) {
                return { id: String(t.id || uid()), text: t.text, done: !!t.done };
              });
          }
        }
      } catch (e) {
        console.warn('อ่าน localStorage ไม่สำเร็จ ใช้ค่าเริ่มต้นแทน', e);
      }
    }
    return seedFromHtml();
  }

  function seedFromHtml() {
    var seeded = [];
    var items = els.list ? els.list.querySelectorAll('.item') : [];

    Array.prototype.forEach.call(items, function (li) {
      var textEl = li.querySelector('.text');
      var doneEl = li.querySelector('.done');
      if (!textEl) return;
      seeded.push({
        id: (textEl.dataset.id || (doneEl ? doneEl.id : '') || uid()).replace(/^done-/, ''),
        text: (textEl.textContent || '').trim(),
        done: doneEl ? doneEl.checked : false
      });
    });

    return seeded;
  }

  function saveTodos() {
    if (!canStore) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (e) {
      console.warn('บันทึก localStorage ไม่สำเร็จ', e);
    }
  }

  /* ---------- 3) RENDER LAYER ------------------------------------ */

  function createItemEl(todo) {
    var li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = todo.id;

    var done = document.createElement('input');
    done.type = 'checkbox';
    done.className = 'done';
    done.id = 'done-' + todo.id;
    done.dataset.id = todo.id;
    done.checked = todo.done;

    var box = document.createElement('label');
    box.className = 'box';
    box.htmlFor = 'done-' + todo.id;
    box.title = 'ทำเสร็จแล้ว';

    var text = document.createElement('span');
    text.className = 'text';
    text.dataset.id = todo.id;
    text.textContent = todo.text;
    text.title = 'ดับเบิลคลิกเพื่อแก้ไขข้อความ';

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'del-btn';
    del.dataset.id = todo.id;
    del.title = 'ลบรายการนี้';
    del.setAttribute('aria-label', 'ลบรายการ: ' + todo.text);
    del.textContent = '×';

    li.appendChild(done);
    li.appendChild(box);
    li.appendChild(text);
    li.appendChild(del);
    return li;
  }

  function render() {
    if (!els.list) return;

    els.list.textContent = '';

    if (todos.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'ยังไม่มีงานในรายการ — เพิ่มงานแรกได้เลย';
      els.list.appendChild(empty);
    } else {
      todos.forEach(function (todo) {
        els.list.appendChild(createItemEl(todo));
      });
    }

    updateStats();
  }

  function updateStats() {
    if (!els.stats) return;
    var total = todos.length;
    var done = todos.filter(function (t) { return t.done; }).length;
    var left = total - done;
    els.stats.textContent =
      'ทั้งหมด ' + total + ' งาน • เสร็จแล้ว ' + done + ' • ค้างอยู่ ' + left;
  }

  function showToast(message, actionLabel, action) {
    if (!els.toast) return;

    els.toast.textContent = '';

    var msg = document.createElement('span');
    msg.textContent = message;
    els.toast.appendChild(msg);

    if (actionLabel && action) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-btn';
      btn.textContent = actionLabel;
      btn.addEventListener('click', function () {
        hideToast();
        action();
      });
      els.toast.appendChild(btn);
    }

    els.toast.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideToast, UNDO_TIMEOUT);
  }

  function hideToast() {
    if (els.toast) els.toast.hidden = true;
    clearTimeout(undoTimer);
  }

  /* ---------- 4) ACTION LAYER ------------------------------------ */

  function findTodo(id) {
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === id) return todos[i];
    }
    return null;
  }

  function addTodo(rawText) {
    var text = (rawText || '').trim();
    if (!text) {
      if (els.input) els.input.focus();
      return false;
    }

    var todo = { id: uid(), text: text, done: false };
    todos.push(todo);
    saveTodos();

    if (els.list) {
      var emptyEl = els.list.querySelector('.empty');
      if (emptyEl) emptyEl.remove();
      els.list.appendChild(createItemEl(todo));
    }
    updateStats();

    if (els.input) {
      els.input.value = '';
      els.input.focus();
    }
    return true;
  }

  function toggleTodo(id, done) {
    var todo = findTodo(id);
    if (!todo) return;
    todo.done = !!done;
    saveTodos();
    updateStats();
  }

  function deleteTodo(id) {
    var index = -1;
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === id) { index = i; break; }
    }
    if (index === -1) return;

    var removed = todos.splice(index, 1)[0];
    saveTodos();

    var li = els.list ? els.list.querySelector('.item[data-id="' + id + '"]') : null;
    if (li) {
      li.classList.add('removing');
      setTimeout(function () { li.remove(); }, 180);
    }
    updateStats();

    pendingDelete = { todo: removed, index: index };
    showToast('ลบแล้ว: "' + removed.text + '"', 'ย้อนกลับ', function () {
      restoreDeleted();
    });
  }

  function restoreDeleted() {
    if (!pendingDelete) return;
    var pos = Math.min(pendingDelete.index, todos.length);
    todos.splice(pos, 0, pendingDelete.todo);
    pendingDelete = null;
    saveTodos();
    render();
  }

  function clearDone() {
    var remaining = todos.filter(function (t) { return !t.done; });
    var removedCount = todos.length - remaining.length;
    if (removedCount === 0) {
      showToast('ยังไม่มีงานที่ทำเสร็จแล้ว');
      return;
    }
    todos = remaining;
    saveTodos();
    render();
    showToast('ลบงานที่เสร็จแล้วออก ' + removedCount + ' รายการ');
  }

  function resetAll() {
    if (todos.length === 0) {
      showToast('ไม่มีข้อมูลให้ล้าง');
      return;
    }
    var backup = todos.slice();
    todos = [];
    saveTodos();
    render();
    showToast('ล้างรายการทั้งหมดแล้ว', 'ย้อนกลับ', function () {
      todos = backup;
      saveTodos();
      render();
    });
  }

  function startEdit(textEl) {
    if (textEl.isContentEditable) return;
    var original = textEl.textContent;

    textEl.contentEditable = 'true';
    textEl.classList.add('editing');
    textEl.focus();

    var range = document.createRange();
    range.selectNodeContents(textEl);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    function commit(cancel) {
      textEl.contentEditable = 'false';
      textEl.classList.remove('editing');

      var value = (textEl.textContent || '').trim();
      if (cancel || !value) {
        textEl.textContent = original;
        return;
      }
      textEl.textContent = value;
      var todo = findTodo(textEl.dataset.id);
      if (todo && todo.text !== value) {
        todo.text = value;
        saveTodos();
        updateStats();
      }
    }

    textEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commit(true);
      }
    });

    textEl.addEventListener('blur', function () {
      commit(false);
    });
  }

  /* ---------- 5) EVENT LAYER ------------------------------------- */

  function bindEvents() {
    if (els.addBtn) {
      els.addBtn.addEventListener('click', function () {
        addTodo(els.input ? els.input.value : '');
      });
    }

    if (els.input) {
      els.input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addTodo(els.input.value);
        }
      });
    }

    if (els.list) {
      els.list.addEventListener('change', function (e) {
        var t = e.target;
        if (t && t.classList.contains('done')) {
          toggleTodo(t.dataset.id, t.checked);
        }
      });

      els.list.addEventListener('click', function (e) {
        var delBtn = e.target.closest('.del-btn');
        if (delBtn) {
          e.preventDefault();
          deleteTodo(delBtn.dataset.id);
          return;
        }
        var textEl = e.target.closest('.text');
        if (textEl && !textEl.isContentEditable) {
          e.preventDefault();
        }
      });

      els.list.addEventListener('dblclick', function (e) {
        var textEl = e.target.closest('.text');
        if (textEl) startEdit(textEl);
      });
    }

    if (els.clearDoneBtn) {
      els.clearDoneBtn.addEventListener('click', clearDone);
    }

    if (els.resetBtn) {
      els.resetBtn.addEventListener('click', resetAll);
    }
  }

  /* ---------- 6) INIT --------------------------------------------- */

  function init() {
    els.input = $('#todo-input');
    els.addBtn = $('#add-btn');
    els.list = $('#todo-list');
    els.stats = $('#stats');
    els.toast = $('#toast');
    els.clearDoneBtn = $('#clear-done');
    els.resetBtn = $('#reset-all');

    if (!els.list) return;

    todos = loadTodos();
    saveTodos();
    render();
    bindEvents();

    if (!canStore) {
      showToast('เบราว์เซอร์ไม่อนุญาตให้บันทึกข้อมูลถาวร (localStorage)');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
