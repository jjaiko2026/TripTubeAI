"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Bot, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { TripChatUIMessage } from "@/lib/trip-chat";
import type { TripRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TripChat({
  draft,
  onDraftUpdate,
  disabled,
}: {
  draft: TripRequest;
  onDraftUpdate: (patch: Partial<TripRequest>) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, regenerate, addToolOutput } = useChat<TripChatUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/trip-chat" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return;
      if (toolCall.toolName === "updateTripDraft") {
        onDraftUpdate(toolCall.input);
        addToolOutput({ tool: "updateTripDraft", toolCallId: toolCall.toolCallId, output: "ok" });
      }
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status, error]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim() && !isBusy && !disabled) {
      sendMessage({ text: input }, { body: { currentDraft: draft } });
      setInput("");
    }
  }

  return (
    <Card>
      <CardContent className="flex h-[520px] flex-col gap-4 pt-6">
        <div className="flex items-center gap-3 border-b pb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm leading-none font-semibold">여행 플래너 챗봇</p>
            <p className="mt-1 text-xs text-muted-foreground">대화로 조건을 말하면 옆 폼에 자동으로 채워드려요</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
          <ChatBubble
            role="assistant"
            text="안녕하세요! 어떤 여행을 계획하고 계세요? 편하게 말씀해주시면 제가 조건을 정리해서 옆 폼에 채워드릴게요."
          />

          {messages.map((message) => (
            <div key={message.id} className="space-y-2">
              {message.parts.map((part, index) => {
                if (part.type === "text" && part.text.trim()) {
                  return (
                    <ChatBubble key={index} role={message.role === "user" ? "user" : "assistant"} text={part.text} />
                  );
                }
                if (part.type === "tool-updateTripDraft" && part.state === "output-available") {
                  return (
                    <div key={index} className="text-xs text-primary">
                      ✓ 조건을 폼에 반영했어요
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ))}

          {error && (
            <div className="space-y-1 text-sm text-destructive">
              <p>일시적인 오류가 발생했어요.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => regenerate()}>
                다시 시도
              </Button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 제주도로 연인이랑 3박4일, 맛집이랑 힐링 위주로"
            disabled={isBusy || disabled}
          />
          <Button type="submit" size="icon" disabled={isBusy || disabled || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChatBubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
          role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {renderInlineMarkdown(text)}
      </div>
    </div>
  );
}

/** 챗봇 응답에 자주 나오는 `**굵게**` 마크다운만 가볍게 렌더링(별도 마크다운 라이브러리 없이). */
function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((segment, index) =>
    segment.startsWith("**") && segment.endsWith("**") ? (
      <strong key={index}>{segment.slice(2, -2)}</strong>
    ) : (
      <span key={index}>{segment}</span>
    )
  );
}
