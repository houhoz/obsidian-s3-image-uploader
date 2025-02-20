import {
	App,
	Editor,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Remember to rename these classes and interfaces!

interface IS3ImageUploaderPlugin {
	r2AccessKeyId: string;
	r2AccessKeySecret: string;
	r2Bucket: string;
	r2Endpoint: string;
	customDomain: string;
}

const DEFAULT_SETTINGS: IS3ImageUploaderPlugin = {
	r2AccessKeyId: "",
	r2AccessKeySecret: "",
	r2Bucket: "",
	r2Endpoint: "", // 例如：https://<account-id>.r2.cloudflarestorage.com
	customDomain: "", // 可选的自定义域名
};

export default class S3ImageUploaderPlugin extends Plugin {
	settings: IS3ImageUploaderPlugin;
	private s3Client: S3Client;

	async onload() {
		await this.loadSettings();
		this.initializeS3Client();

		// 添加粘贴事件监听
		this.registerEvent(
			this.app.workspace.on(
				"editor-paste",
				async (evt: ClipboardEvent, editor: Editor) => {
					const files = evt.clipboardData?.files;
					if (!files || files.length === 0) return;

					for (let i = 0; i < files.length; i++) {
						const file = files[i];
						if (!file.type.startsWith("image/")) continue;

						// 阻止默认粘贴行为
						evt.preventDefault();

						try {
							// 生成唯一的文件名
							const timestamp = Date.now();
							const fileName = `image-${timestamp}${getFileExtension(
								file.name
							)}`;

							// 上传到 R2
							const imageUrl = await this.uploadToR2(
								file,
								fileName
							);

							// 插入 Markdown 图片语法
							const imageMarkdown = `![${file.name}](${imageUrl})`;
							editor.replaceSelection(imageMarkdown);

							new Notice("图片上传成功！");
						} catch (error) {
							new Notice(`上传失败: ${error.message}`);
							console.error("Upload failed:", error);
						}
					}
				}
			)
		);

		// 添加设置选项卡
		this.addSettingTab(new SettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.initializeS3Client();
	}

	private initializeS3Client() {
		this.s3Client = new S3Client({
			region: "auto",
			endpoint: this.settings.r2Endpoint,
			credentials: {
				accessKeyId: this.settings.r2AccessKeyId,
				secretAccessKey: this.settings.r2AccessKeySecret,
			},
		});
	}

	async uploadToR2(file: File, fileName: string): Promise<string> {
		if (
			!this.settings.r2AccessKeyId ||
			!this.settings.r2AccessKeySecret ||
			!this.settings.r2Endpoint
		) {
			throw new Error("请先配置 R2 设置");
		}

		try {
			const arrayBuffer = await file.arrayBuffer();
			const command = new PutObjectCommand({
				Bucket: this.settings.r2Bucket,
				Key: fileName,
				Body: Buffer.from(arrayBuffer),
				ContentType: file.type,
			});

			await this.s3Client.send(command);

			return this.settings.customDomain
				? `${this.settings.customDomain}/${fileName}`
				: `${this.settings.r2Endpoint}/${this.settings.r2Bucket}/${fileName}`;
		} catch (error) {
			console.error("Upload error:", error);
			throw error;
		}
	}
}

// 获取文件扩展名的辅助函数
function getFileExtension(filename: string): string {
	const ext = filename.split(".").pop();
	return ext ? `.${ext}` : "";
}

class SettingTab extends PluginSettingTab {
	plugin: S3ImageUploaderPlugin;

	constructor(app: App, plugin: S3ImageUploaderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("R2 Access Key ID")
			.setDesc("Cloudflare R2 的 Access Key ID")
			.addText((text) =>
				text
					.setPlaceholder("Access Key ID")
					.setValue(this.plugin.settings.r2AccessKeyId)
					.onChange(async (value) => {
						this.plugin.settings.r2AccessKeyId = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("R2 Secret Access Key")
			.setDesc("Cloudflare R2 的 Secret Access Key")
			.addText((text) =>
				text
					.setPlaceholder("Secret Access Key")
					.setValue(this.plugin.settings.r2AccessKeySecret)
					.onChange(async (value) => {
						this.plugin.settings.r2AccessKeySecret = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("R2 Bucket")
			.setDesc("R2 存储桶名称")
			.addText((text) =>
				text
					.setPlaceholder("your-bucket-name")
					.setValue(this.plugin.settings.r2Bucket)
					.onChange(async (value) => {
						this.plugin.settings.r2Bucket = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("R2 Endpoint")
			.setDesc("R2 终端节点 URL")
			.addText((text) =>
				text
					.setPlaceholder(
						"https://<account-id>.r2.cloudflarestorage.com"
					)
					.setValue(this.plugin.settings.r2Endpoint)
					.onChange(async (value) => {
						this.plugin.settings.r2Endpoint = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("自定义域名")
			.setDesc("可选：配置自定义域名（如果有的话）")
			.addText((text) =>
				text
					.setPlaceholder("https://images.yourdomain.com")
					.setValue(this.plugin.settings.customDomain)
					.onChange(async (value) => {
						this.plugin.settings.customDomain = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
