// Import cấu hình cơ bản từ SillyTavern core
import { extension_settings } from "../../../extensions.js";
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
}

function onCheckboxChange(event) {
    const value = $(event.target).prop("checked");
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();
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

// Khởi tạo Extension
jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);
   
    try {
        // Tải HTML từ file
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
       
        // Thêm vào bảng cài đặt (Cột bên phải dành cho các tiện ích giao diện)
        $("#extensions_settings2").append(settingsHtml);
       
        // NEW: Bind checkbox event
        $("#hud_simu_enabled_checkbox").on("input", onCheckboxChange);
       
        // NEW: Bind button event
        $("#hud_simu_test_button").on("click", onButtonClick);
       
        // NEW: Load saved settings
        loadSettings();
       
        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
