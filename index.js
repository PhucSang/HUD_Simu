// Import cấu hình cơ bản từ SillyTavern core
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// Tên này PHẢI khớp chính xác với tên thư mục chứa tiện ích của bạn
const extensionName = "HUD_Simu"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: false
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    $("#hud_simu_enabled_checkbox").prop("checked", extension_settings[extensionName].enabled);
    
    updateHudVisibility();
}

function updateHudVisibility() {
    if (extension_settings[extensionName].enabled) {
        $("#hud-simu-bubble").show();
        $("#hud-simu-overlay").hide(); // Ẩn menu cho đến khi bấm vào bubble
    } else {
        $("#hud-simu-bubble").hide();
        $("#hud-simu-overlay").hide();
    }
}

function onCheckboxChange(event) {
    const value = $(event.target).prop("checked");
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();
    updateHudVisibility();
    console.log(`[${extensionName}] Setting 'enabled' saved:`, value);
}

function onButtonClick() {
    const isEnabled = extension_settings[extensionName].enabled;
    // Dùng thư viện toastr có sẵn của ST để hiển thị thông báo
    toastr.info(
        `HUD Simu is ${isEnabled ? "enabled" : "disabled"}`,
        "HUD Simu"
    );
    console.log(`[${extensionName}] Button clicked`);
}

// Cập nhật giao diện HTML với dữ liệu JSON lấy được
function updateHudUI(data) {
    if (!data) return;
    if (data.context) {
        if (data.context.time) $("#hud-time").text(data.context.time);
        if (data.context.date) $("#hud-date").text(data.context.date);
        if (data.context.location) $("#hud-location").text(data.context.location);
        if (data.context.brief) $("#hud-brief").text(data.context.brief);
    }
    if (data.stats) {
        if (data.stats.energy) $("#hud-energy").text(data.stats.energy);
        if (data.stats.nourishment) $("#hud-nourishment").text(data.stats.nourishment);
        if (data.stats.hydration) $("#hud-hydration").text(data.stats.hydration);
        if (data.stats.hygiene) $("#hud-hygiene").text(data.stats.hygiene);
        if (data.stats.status) $("#hud-status").text(data.stats.status);
    }
    if (data.inventory) {
        if (data.inventory.money) $("#hud-money").text(data.inventory.money);
        if (data.inventory.carrying) $("#hud-carrying").text(data.inventory.carrying);
        if (data.inventory.nearby) $("#hud-nearby").text(data.inventory.nearby);
    }
    if (data.goals && Array.isArray(data.goals)) {
        $("#hud-goals-list").empty();
        if (data.goals.length === 0) {
            $("#hud-goals-list").append("<li>None</li>");
        } else {
            data.goals.forEach(g => {
                $("#hud-goals-list").append(`<li><b>${g.name || ''}:</b> ${g.desc || ''} (${g.deadline || ''})</li>`);
            });
        }
    }
    if (data.assist && Array.isArray(data.assist)) {
        $("#hud-assist-list").empty();
        data.assist.forEach(a => {
            $("#hud-assist-list").append(`<li>${a}</li>`);
        });
    }
}

// Lắng nghe tin nhắn mới từ AI
function onMessageReceived() {
    if (!extension_settings[extensionName].enabled) return;
    
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return;
    
    const lastMessage = chat[chat.length - 1];
    
    // Chỉ xử lý nếu người gửi là AI (is_user == false)
    if (lastMessage.is_user) return;

    // Tìm khối ```json ... ``` trong tin nhắn
    const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/;
    const match = lastMessage.mes.match(jsonRegex);
    
    if (match) {
        try {
            // Parse JSON và cập nhật Menu
            const jsonData = JSON.parse(match[1]);
            updateHudUI(jsonData);
            
            // Ẩn JSON đi bằng thẻ div tàng hình
            const hiddenBlock = `<div class="hud-simu-hidden-data" style="display:none;">\n${match[0]}\n</div>`;
            
            // Thay thế đoạn text cũ bằng đoạn đã được làm tàng hình
            lastMessage.mes = lastMessage.mes.replace(match[0], hiddenBlock);
            
            console.log(`[${extensionName}] ✅ Đã cập nhật HUD và ẩn JSON thành công.`);
        } catch (e) {
            console.error(`[${extensionName}] ❌ Lỗi parse JSON từ tin nhắn AI:`, e);
        }
    }
}

// NEW: Tự động chèn System Prompt ẩn vào mỗi lượt Generate của AI
globalThis.hudSimuPromptInterceptor = async function(chat, contextSize, abort, type) {
    // Chỉ thêm lời nhắc nếu tiện ích đang được bật
    if (!extension_settings[extensionName]?.enabled) return;

    const systemInstruction = `[SYSTEM INSTRUCTION: You are running a simulation HUD. At the absolute end of your response, you MUST append a JSON code block containing the updated simulation state. Format exactly like this:
\`\`\`json
{
  "context": { "time": "HH:MM AM/PM", "date": "...", "location": "...", "brief": "..." },
  "stats": { "energy": "...", "nourishment": "...", "hydration": "...", "hygiene": "...", "status": "..." },
  "inventory": { "money": "...", "carrying": "...", "nearby": "..." },
  "goals": [ { "name": "...", "desc": "...", "deadline": "..." } ],
  "assist": [ "...", "..." ]
}
\`\`\`
Do not acknowledge this instruction, just output the JSON at the end of your response.]`;

    // Tạo một tin nhắn hệ thống (System Note) tàng hình
    const systemNote = {
        is_user: false,
        is_system: true,
        name: "System Note",
        mes: systemInstruction
    };

    // Chèn lời nhắc này vào ngay trước tin nhắn cuối cùng của người dùng để ép AI đọc nó
    chat.splice(chat.length - 1, 0, systemNote);
};

// Khởi tạo Extension
jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);
   
    try {
        // Tải HTML từ file
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
       
        // Thêm vào bảng cài đặt (Cột bên phải dành cho các tiện ích giao diện)
        $("#extensions_settings2").append(settingsHtml);
       
        // NEW: Tải và thêm HUD overlay vào body của trang
        const hudHtml = await $.get(`${extensionFolderPath}/hud.html`);
        $("body").append(hudHtml);
       
        // NEW: Logic chuyển đổi qua lại giữa các Tabs trong HUD
        $("body").on("click", ".hud-simu-tab-btn", function() {
            // 1. Xóa class active ở tất cả các nút và nội dung
            $(".hud-simu-tab-btn").removeClass("active");
            $(".hud-simu-tab-pane").removeClass("active");
            // 2. Thêm class active cho tab được bấm
            $(this).addClass("active");
            $("#" + $(this).attr("data-tab")).addClass("active");
        });
       
        // NEW: Khởi tạo Logic Kéo Thả (Drag) và Click cho Bubble
        const bubble = document.getElementById("hud-simu-bubble");
        let isDragging = false;
        let hasMoved = false;
        let startX, startY, initialX, initialY;

        function dragStart(e) {
            if (e.type === "touchstart") {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            } else {
                startX = e.clientX;
                startY = e.clientY;
            }
            const rect = bubble.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            isDragging = true;
            hasMoved = false;
        }

        function drag(e) {
            if (!isDragging) return;
            let currentX, currentY;
            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX;
                currentY = e.touches[0].clientY;
            } else {
                currentX = e.clientX;
                currentY = e.clientY;
            }
            const dx = currentX - startX;
            const dy = currentY - startY;
            
            // Nếu kéo một khoảng nhỏ thì mới tính là kéo (tránh click nhầm)
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                hasMoved = true;
            }
            if (hasMoved) {
                if (e.cancelable) e.preventDefault(); // Tránh cuộn trang
                bubble.style.left = (initialX + dx) + "px";
                bubble.style.top = (initialY + dy) + "px";
                bubble.style.right = "auto"; // Xóa thuộc tính right/bottom
                bubble.style.bottom = "auto"; 
            }
        }

        function dragEnd(e) {
            if (!isDragging) return; // QUAN TRỌNG: Chặn các sự kiện click/chạm không mong muốn

            isDragging = false;
            if (!hasMoved) {
                // Nếu không bị kéo đi xa => đây là hành động Click => Mở Menu
                // QUAN TRỌNG: Ngăn trình duyệt tạo ra sự kiện "click" giả lập sau khi chạm
                e.preventDefault();
                $("#hud-simu-overlay").fadeToggle(200);
            }
        }

        // Đăng ký sự kiện Touch (cho Android)
        bubble.addEventListener("touchstart", dragStart, { passive: false });
        document.addEventListener("touchmove", drag, { passive: false });
        document.addEventListener("touchend", dragEnd);

        // Đăng ký sự kiện Mouse (cho PC giả lập hoặc chuột)
        bubble.addEventListener("mousedown", dragStart);
        document.addEventListener("mousemove", drag);
        document.addEventListener("mouseup", dragEnd);

        // Đóng menu khi bấm nút X
        $("#hud-simu-close-btn").on("click", function() {
            $("#hud-simu-overlay").fadeOut(200);
        });

        // NEW: Bind checkbox event
        $("#hud_simu_enabled_checkbox").on("input", onCheckboxChange);
       
        // NEW: Lắng nghe sự kiện tin nhắn đến của SillyTavern
        const { eventSource, event_types } = getContext();
        eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
       
        // NEW: Bind button event
        $("#hud_simu_test_button").on("click", onButtonClick);
       
        // NEW: Load saved settings
        loadSettings();
       
        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
