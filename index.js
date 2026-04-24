// Import cấu hình cơ bản từ SillyTavern core
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// Tên này PHẢI khớp chính xác với tên thư mục chứa tiện ích của bạn
const extensionName = "HUD_Simu"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: false
};

// Biến toàn cục để theo dõi các món đồ đã nhặt trước khi Accept
let pickedUpItems = [];

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
        
        // Xử lý cột Carrying (Bên trái)
        $("#hud-carrying-list").empty();
        let carrying = data.inventory.carrying;
        if (typeof carrying === 'string') carrying = carrying.split(',').map(s => s.trim()).filter(s => s);
        if (Array.isArray(carrying)) {
            carrying.forEach(item => {
                $("#hud-carrying-list").append(`<li>${item}</li>`);
            });
        }

        // Xử lý cột Nearby (Bên phải)
        $("#hud-nearby-list").empty();
        let nearby = data.inventory.nearby;
        if (typeof nearby === 'string') nearby = nearby.split(',').map(s => s.trim()).filter(s => s);
        if (Array.isArray(nearby)) {
            nearby.forEach(item => {
                $("#hud-nearby-list").append(`<li><span>${item}</span> <button class="hud-add-item-btn" data-item="${item}">+</button></li>`);
            });
        }
        // Reset danh sách tạm nhặt mỗi khi cập nhật dữ liệu mới từ AI
        pickedUpItems = [];
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
            $("#hud-assist-list").append(`<li class="hud-assist-option">${a}</li>`);
        });
    }
}

// Lắng nghe tin nhắn mới từ AI
async function onMessageReceived() {
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
            
            // NEW: Lưu trạng thái vào chatMetadata của cuộc trò chuyện hiện tại để AI nhớ
            context.chatMetadata['hud_simu_state'] = jsonData;
            if (typeof context.saveMetadata === 'function') {
                await context.saveMetadata();
            }

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

// NEW: Cập nhật lại Menu khi người dùng đổi sang Chat khác hoặc tải lại trang
function onChatChanged() {
    if (!extension_settings[extensionName].enabled) return;
    const context = getContext();
    if (context.chatMetadata && context.chatMetadata['hud_simu_state']) {
        updateHudUI(context.chatMetadata['hud_simu_state']);
    }
}

// NEW: Tự động chèn System Prompt ẩn vào mỗi lượt Generate của AI
globalThis.hudSimuPromptInterceptor = async function(chat, contextSize, abort, type) {
    // Chỉ thêm lời nhắc nếu tiện ích đang được bật
    if (!extension_settings[extensionName]?.enabled) return;

    const context = getContext();
    let currentStateText = "";
    
    // NEW: Đọc trạng thái hiện tại từ metadata và báo cho AI biết
    if (context.chatMetadata && context.chatMetadata['hud_simu_state']) {
        currentStateText = `\n\n[CURRENT STATE]:\n\`\`\`json\n${JSON.stringify(context.chatMetadata['hud_simu_state'], null, 2)}\n\`\`\`\n(Note: Use this current state as context for your generation. Update it logically based on new events).`;
    }

    const systemInstruction = `[SYSTEM INSTRUCTION: You are running a simulation HUD.${currentStateText}\n\nAt the absolute end of your response, you MUST append a JSON code block containing the updated simulation state. Format exactly like this:
\`\`\`json
{
  "context": { "time": "HH:MM AM/PM", "date": "...", "location": "...", "brief": "..." },
  "stats": { "energy": "...", "nourishment": "...", "hydration": "...", "hygiene": "...", "status": "..." },
  "inventory": { "money": "...", "carrying": ["item1", "item2"], "nearby": ["item3", "item4"] },
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

        // NEW: Xử lý khi click vào tùy chọn Assist
        $("body").on("click", ".hud-assist-option", function() {
            const optionText = $(this).text();
            // 1. Điền text vào khung chat của SillyTavern và kích hoạt event input
            $("#send_textarea").val(optionText).trigger("input");
            // 2. Bấm nút Gửi
            $("#send_but").click();
            // 3. Đóng Menu HUD lại
            $("#hud-simu-overlay").fadeOut(200);
        });

        // NEW: Lắng nghe khi bấm nút [+] ở ô Nearby
        $("body").on("click", ".hud-add-item-btn", function() {
            const itemName = $(this).attr("data-item");
            pickedUpItems.push(itemName); // Lưu vào mảng tạm
            // Bơm giao diện qua bên trái
            $("#hud-carrying-list").append(`<li>${itemName}</li>`);
            // Xóa khỏi bên phải
            $(this).parent().remove();
        });

        // NEW: Lắng nghe khi bấm Accept Loot
        $("body").on("click", "#hud-inventory-accept-btn", function() {
            if (pickedUpItems.length === 0) return; // Chưa chọn gì thì không chạy

            const pickupText = `pick up: [${pickedUpItems.join(", ")}] `;
            const currentInput = $("#send_textarea").val();
            
            // Chèn text vào khung nhập liệu (nhưng KHÔNG tự gửi)
            const newText = currentInput ? currentInput + " " + pickupText : pickupText;
            $("#send_textarea").val(newText).trigger("input");
            $("#send_textarea").focus();
            
            $("#hud-simu-overlay").fadeOut(200); // Đóng menu
        });

        // NEW: Bind checkbox event
        $("#hud_simu_enabled_checkbox").on("input", onCheckboxChange);
       
        // NEW: Lắng nghe sự kiện tin nhắn đến của SillyTavern
        const { eventSource, event_types } = getContext();
        eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
        eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
       
        // NEW: Bind button event
        $("#hud_simu_test_button").on("click", onButtonClick);
       
        // NEW: Load saved settings
        loadSettings();
       
        // NEW: Cập nhật giao diện lần đầu khi load trang
        onChatChanged();

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
