// components/ChatInterface.tsx — Chat IA adapté pour React Native
// Adapté depuis FrontEnd/components/ChatInterface.tsx

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
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message, Policy } from '../types';
import { sendMessageToAssistantStream } from '../services/geminiService';
import { uuid } from '../utils/uuid';

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

    const botMsg: Message = {
      id: uuid(),
      role: 'model',
      text: '',
      timestamp: Date.now(),
      isTyping: true,
    };

    setMessages(prev => [...prev, userMsg, botMsg]);
    setInput('');
    setIsLoading(true);

    try {
      await sendMessageToAssistantStream(
        text,
        policies,
        [...messages, userMsg],
        chunk => {
          setMessages(prev =>
            prev.map(m =>
              m.id === botMsg.id
                ? { ...m, text: m.text + chunk, isTyping: true }
                : m,
            ),
          );
        },
        () => {
          setMessages(prev =>
            prev.map(m => (m.id === botMsg.id ? { ...m, isTyping: false } : m)),
          );
          setIsLoading(false);
        },
      );
    } catch (e: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === botMsg.id
            ? { ...m, text: "Désolé, une erreur est survenue.", isTyping: false }
            : m,
        ),
      );
      setIsLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={14} color="#0ea5e9" />
          </View>
        )}
        <View style={[styles.bubbleContent, isUser ? styles.userContent : styles.botContent]}>
          {item.isTyping && item.text === '' ? (
            <ActivityIndicator size="small" color="#0ea5e9" />
          ) : (
            <Text style={[styles.messageText, isUser ? styles.userText : styles.botText]}>
              {item.text}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubbles-outline" size={40} color="#0ea5e9" />
            </View>
            <Text style={styles.emptyTitle}>Votre assistant assurance</Text>
            <Text style={styles.emptySubtitle}>
              Posez vos questions sur vos contrats, la couverture, ou les sinistres.
            </Text>
            {/* Suggestions rapides */}
            <View style={styles.suggestions}>
              {[
                "Ai-je besoin d'une mutuelle complémentaire ?",
                "Quels sont mes doublons d'assurance ?",
                "Comment déclarer un sinistre ?",
              ].map((q, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggestion}
                  onPress={() => { setInput(q); }}
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

        {/* Barre d'envoi */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Écrivez votre message…"
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={2000}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { flexDirection: 'row', marginVertical: 4, alignItems: 'flex-end', gap: 8 },
  userBubble: { justifyContent: 'flex-end' },
  botBubble: { justifyContent: 'flex-start' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleContent: { maxWidth: '80%', borderRadius: 16, padding: 12 },
  userContent: {
    backgroundColor: '#0ea5e9',
    borderBottomRightRadius: 4,
  },
  botContent: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  messageText: { fontSize: 14, lineHeight: 20 },
  userText: { color: '#fff' },
  botText: { color: '#0f172a' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20 },
  suggestions: { gap: 8, width: '100%', marginTop: 8 },
  suggestion: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  suggestionText: { fontSize: 13, color: '#0ea5e9', fontWeight: '500' },
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
    fontSize: 15,
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
  sendBtnDisabled: { backgroundColor: '#cbd5e1' },
});
