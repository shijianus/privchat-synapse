import React, { useState } from 'react';
import { useToast } from '../components/useToast';
import { apiService } from '../services/api';

type AudienceInput = string;

const AnnouncementsPage: React.FC = () => {
  const { addToast } = useToast();
  const [channelKey, setChannelKey] = useState('updates');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [html, setHtml] = useState('');
  const [audience, setAudience] = useState<AudienceInput>(''); // comma-separated
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const audienceList = audience
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (!channelKey || !title || !content || audienceList.length === 0) {
      addToast('请填写频道、标题、内容并至少指定一位受众', 'error');
      return;
    }
    setLoading(true);
    try {
      await apiService.broadcastAnnouncement({
        channelKey,
        title,
        content,
        html: html || undefined,
        audience: audienceList,
      });
      addToast('已提交公告并转发至 Bot', 'success');
      setTitle('');
      setContent('');
      setHtml('');
      setAudience('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交失败';
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">公告 / 影子房间广播</h1>
            <p className="text-sm text-gray-500">
              管理员可通过 Bot 向用户一对一 DM 发送“公众号”式公告。受众互不可见。
            </p>
          </div>
          <span className="px-2 py-1 text-xs rounded-full bg-primary-50 text-primary-700 font-semibold">
            Bot Bridge
          </span>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-gray-700">
              频道 Key
              <input
                value={channelKey}
                onChange={(e) => setChannelKey(e.target.value)}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                placeholder="updates"
              />
            </label>
            <label className="block text-sm text-gray-700">
              标题
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                placeholder="公告标题"
              />
            </label>
          </div>
          <label className="block text-sm text-gray-700">
            纯文本内容
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
              placeholder="向受众推送的文本内容"
            />
          </label>
          <label className="block text-sm text-gray-700">
            HTML（可选）
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
              placeholder="<b>加粗</b><br>换行"
            />
          </label>
          <label className="block text-sm text-gray-700">
            受众列表（逗号分隔，Matrix ID 或用户名）
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
              placeholder="@alice:server,@bob:server 或 alice,bob"
            />
          </label>
          <div className="flex items-center space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 rounded bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-60"
            >
              {loading ? '发送中…' : '发送公告'}
            </button>
            <span className="text-xs text-gray-500">
              将经由 Bot 按 channelKey 为每位受众创建/复用私聊并发送。
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AnnouncementsPage;
