// components/ChatInterface.tsx — Chat IA adapté pour React Native
// Aligné sur FrontEnd/components/ChatInterface.tsx

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  SafeAreaView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message, Policy } from '../types';
import { sendMessageToAssistantStream } from '../services/geminiService';
import { uuid } from '../utils/uuid';

// ─────────────────────────────────────────────────────────────────────────────
// Rendu Markdown pour React Native
// Gère : **gras**, *italique*, `code`, [lien](url), - listes, ## titres
// ─────────────────────────────────────────────────────────────────────────────

type Segment = { type: 'text' | 'bold' | 'italic' | 'code' | 'link'; text: string; url?: string };

function tokenizeLine(raw: string): Segment[] {
  const out: Segment[] = [];
  let rest = raw;
  while (rest.length > 0) {
    const linkM = rest.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (linkM) { out.push({ type: 'link', text: linkM[1], url: linkM[2] }); rest = rest.slice(linkM[0].length); continue; }
    const boldM = rest.match(/^\*\*([^*]+)\*\*/);
    if (boldM) { out.push({ type: 'bold', text: boldM[1] }); rest = rest.slice(boldM[0].length); continue; }
    const italM = rest.match(/^\*([^*]+)\*/);
    if (italM) { out.push({ type: 'italic', text: italM[1] }); rest = rest.slice(italM[0].length); continue; }
    const codeM = rest.match(/^`([^`]+)`/);
    if (codeM) { out.push({ type: 'code', text: codeM[1] }); rest = rest.slice(codeM[0].length); continue; }
    const nextIdx = rest.search(/[\[*`]/);
    if (nextIdx === 0) { out.push({ type: 'text', text: rest[0] }); rest = rest.slice(1); }
    else if (nextIdx > 0) { out.push({ type: 'text', text: rest.slice(0, nextIdx) }); rest = rest.slice(nextIdx); }
    else { out.push({ type: 'text', text: rest }); rest = ''; }
  }
  return out;
}

function InlineText({ segments, isUser }: { segments: Segment[]; isUser: boolean }) {
  return (
    <Text>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'bold': return <Text key={i} style={isUser ? styles.mdUserBold : styles.mdBold}>{seg.text}</Text>;
          case 'italic': return <Text key={i} style={isUser ? styles.mdUserItalic : styles.mdItalic}>{seg.text}</Text>;
          case 'code': return <Text key={i} style={isUser ? styles.mdUserCode : styles.mdCode}>{seg.text}</Text>;
          case 'link': return (
            <Text key={i} style={styles.mdLink} onPress={() => seg.url && Linking.openURL(seg.url)}>
              {seg.text} ↗
            </Text>
          );
          default: return <Text key={i} style={isUser ? styles.userText : styles.botText}>{seg.text}</Text>;
        }
      })}
    </Text>
  );
}

function MarkdownText({ text, isUser }: { text: string; isUser: boolean }) {
  const lines = text.split('\n');
  return (
    <View style={{ gap: 2 }}>
      {lines.map((line, i) => {
        if (line.trim() === '') return <View key={i} style={{ height: 4 }} />;
        if (/^#{1,3}\s/.test(line)) {
          const level = (line.match(/^(#{1,3})\s/) || ['', ''])[1].length;
          const content = line.replace(/^#{1,3}\s/, '');
          return (
            <Text key={i} style={isUser ? styles.userText : (level === 1 ? styles.mdH1 : styles.mdH2)}>
              {content}
            </Text>
          );
        }
        if (/^[-•]\s/.test(line)) {
          return (
            <View key={i} style={styles.mdListItem}>
              <Text style={isUser ? styles.userText : styles.mdBullet}>{'  •  '}</Text>
              <InlineText segments={tokenizeLine(line.replace(/^[-•]\s/, ''))} isUser={isUser} />
            </View>
          );
        }
        return <InlineText key={i} segments={tokenizeLine(line)} isUser={isUser} />;
      })}
    </View>
  );
}

/* Bouncing dots loader matching web's 3-dot animation */
function BouncingDots() {
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  const anim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      );
    const a = bounce(anim1, 0);
    const b = bounce(anim2, 200);
    const c = bounce(anim3, 400);
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, []);

  return (
    <View style={styles.dotsRow}>
      {[anim1, anim2, anim3].map((a, i) => (
        <Animated.View key={i} style={[styles.dot, { transform: [{ translateY: a }] }]} />
      ))}
    </View>
  );
}

interface Props {
  policies: Policy[];
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export function ChatInterface({ policies, messages, setMessages }: Props) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: uuid(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };

    const botMsgId = uuid();
    const botMsg: Message = {
      id: botMsgId,
      role: 'model',
      text: '',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg, botMsg]);
    setInput('');
    setIsLoading(true);

    try {
      let accumulatedText = '';

      await sendMessageToAssistantStream(
        text,
        policies,
        [...messages, userMsg],
        (chunk: string) => {
          accumulatedText += chunk;
          setMessages(prev =>
            prev.map(m =>
              m.id === botMsgId ? { ...m, text: accumulatedText } : m,
            ),
          );
        },
        () => {
          setIsLoading(false);
        },
      );
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === botMsgId
            ? { ...m, text: "Désolé, j'ai rencontré une erreur. Veuillez réessayer." }
            : m,
        ),
      );
      setIsLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.row, isUser ? styles.rowUser : styles.rowBot]}>
        <View style={[styles.bubbleContent, isUser ? styles.userContent : styles.botContent]}>
          {item.text === '' && isLoading ? (
            <BouncingDots />
          ) : (
            <MarkdownText text={item.text} isUser={isUser} />
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header — matches web's "Assistant Expert" bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#0ea5e9" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Assistant Expert</Text>
            <Text style={styles.headerSubtitle}>Posez vos questions sur vos contrats</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="sparkles" size={32} color="#7dd3fc" />
            </View>
            <Text style={styles.emptyHint}>
              {"\"Est-ce que je suis couvert pour le bris de glace ?\"\n\"Quel est le montant de ma franchise ?\""}
            </Text>
            {/* Suggestion chips for mobile touch UX */}
            <View style={styles.suggestions}>
              {[
                "Comment optimiser mes assurances ?",
                "Ai‑je des trous de couverture ?",
                "Quelles options puis-je supprimer ?",
              ].map((q, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggestion}
                  onPress={() => setInput(q)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Posez votre question..."
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={2000}
            editable={!isLoading}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || isLoading}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  flex: { flex: 1 },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  headerSubtitle: { fontSize: 11, color: '#64748b', marginTop: 1 },

  /* Messages */
  messageList: { padding: 16, paddingBottom: 8, gap: 16 },
  row: { flexDirection: 'row', marginVertical: 2 },
  rowUser: { justifyContent: 'flex-end' },
  rowBot: { justifyContent: 'flex-start' },
  bubbleContent: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  userContent: {
    backgroundColor: '#0ea5e9',
    borderBottomRightRadius: 0,
  },
  botContent: {
    backgroundColor: '#f1f5f9',
    borderBottomLeftRadius: 0,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  /* Text */
  userText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  botText: { color: '#1e293b', fontSize: 14, lineHeight: 20 },

  /* Markdown bot */
  mdH1: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginTop: 6, marginBottom: 2 },
  mdH2: { fontSize: 14, fontWeight: '600', color: '#1e293b', marginTop: 4, marginBottom: 1 },
  mdBold: { fontWeight: '700', color: '#0f172a' },
  mdItalic: { fontStyle: 'italic', color: '#334155' },
  mdCode: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', backgroundColor: '#e2e8f0', color: '#0f172a', borderRadius: 3, fontSize: 12 },
  mdLink: { color: '#0ea5e9', textDecorationLine: 'underline' },
  mdListItem: { flexDirection: 'row', alignItems: 'flex-start' },
  mdBullet: { color: '#64748b', fontSize: 14 },

  /* Markdown user (white on blue) */
  mdUserBold: { fontWeight: '700', color: '#fff' },
  mdUserItalic: { fontStyle: 'italic', color: '#e0f2fe' },
  mdUserCode: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#fff', fontSize: 12 },

  /* Bouncing dots */
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#94a3b8' },

  /* Empty state */
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, opacity: 0.7 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyHint: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22 },
  suggestions: { gap: 8, width: '100%', marginTop: 16 },
  suggestion: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  suggestionText: { fontSize: 13, color: '#0ea5e9', fontWeight: '500' },

  /* Input bar */
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: Platform.OS === 'android' ? 12 : 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    maxHeight: 120,
    backgroundColor: '#f8fafc',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});
