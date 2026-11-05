import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, KeyboardTypeOptions, Modal, Platform,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

type BookForm = {
  name: string;
  year: string;
  writer: string;
  publisher: string;
  genre: string;
  pages: string;
};
type Book = BookForm & { id: string };
type Session = { uid: string; name: string; admin: boolean };

const seed: BookForm[] = [
  { name: 'Dom Casmurro', year: '1899', writer: 'Machado de Assis', publisher: 'Garnier', genre: 'Romance', pages: '256' },
  { name: 'O Pequeno Príncipe', year: '1943', writer: 'Antoine de Saint-Exupéry', publisher: 'Reynal & Hitchcock', genre: 'Fábula', pages: '96' },
  { name: 'A Hora da Estrela', year: '1977', writer: 'Clarice Lispector', publisher: 'Rocco', genre: 'Romance', pages: '88' },
];
const blank: BookForm = { name: '', year: '', writer: '', publisher: '', genre: '', pages: '' };
const fields: [keyof BookForm, string][] = [
  ['name', 'Nome'],
  ['year', 'Ano'],
  ['writer', 'Escritor'],
  ['publisher', 'Editora'],
  ['genre', 'Gênero'],
  ['pages', 'Número de páginas'],
];

function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos.';
    case 'auth/invalid-email':
      return 'E-mail inválido.';
    case 'auth/email-already-in-use':
      return 'Este e-mail já está cadastrado.';
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'Sem conexão com a internet.';
    case 'permission-denied':
      return 'Você não tem permissão para fazer isso.';
    default:
      return 'Algo deu errado. Tente novamente.';
  }
}

type InputProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

function Input({ label, value, onChangeText, keyboardType, secureTextEntry, autoCapitalize }: InputProps) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        placeholder={label}
        placeholderTextColor="#9A9A91"
      />
    </View>
  );
}

type ButtonProps = { title: string; onPress: () => void; small?: boolean; outline?: boolean; disabled?: boolean };

function Button({ title, onPress, small, outline, disabled }: ButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[s.button, small && s.small, outline && s.outline, disabled && s.disabled]}
    >
      <Text style={[s.buttonText, outline && s.outlineText]}>{title}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [user, setUser] = useState<Session | null>(null);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [pass, setPass] = useState<string>('');
  const [register, setRegister] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [modal, setModal] = useState<boolean>(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<BookForm>(blank);
  const signingUp = useRef<boolean>(false);

  // Mantém o login entre aberturas do app e descobre se o usuário é admin.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (signingUp.current) return; // o cadastro define o usuário sozinho
      if (!fu) {
        setUser(null);
        setAuthReady(true);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'usuarios', fu.uid));
        const d = snap.data() as { nome?: string; role?: string } | undefined;
        setUser({ uid: fu.uid, name: d?.nome ?? fu.email ?? 'Leitor', admin: d?.role === 'admin' });
      } catch {
        setUser({ uid: fu.uid, name: fu.email ?? 'Leitor', admin: false });
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Escuta a coleção de livros em tempo real enquanto houver usuário logado.
  useEffect(() => {
    if (!user) {
      setBooks([]);
      return;
    }
    const q = query(collection(db, 'livros'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBooks(
          snap.docs.map((d) => {
            const x = d.data() as Partial<BookForm>;
            return {
              id: d.id,
              name: x.name ?? '',
              year: x.year ?? '',
              writer: x.writer ?? '',
              publisher: x.publisher ?? '',
              genre: x.genre ?? '',
              pages: x.pages ?? '',
            };
          })
        );
      },
      () => Alert.alert('Erro', 'Não foi possível carregar os livros.')
    );
    return unsub;
  }, [user?.uid]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter(
      (b) => !q || [b.name, b.writer, b.genre, b.publisher, b.year].some((x) => x.toLowerCase().includes(q))
    );
  }, [books, search]);

  const enter = async () => {
    if (!email.trim() || !pass) {
      Alert.alert('Dados inválidos', 'Informe e-mail e senha.');
      return;
    }
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      setPass('');
    } catch (e) {
      Alert.alert('Acesso não autorizado', friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const signup = async () => {
    const n = name.trim();
    const em = email.trim();
    if (n.length < 3 || !em || pass.length < 6) {
      Alert.alert('Dados inválidos', 'Informe nome (3+ letras), e-mail e senha (6+ caracteres).');
      return;
    }
    setBusy(true);
    signingUp.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, em, pass);
      await setDoc(doc(db, 'usuarios', cred.user.uid), { nome: n, email: em, role: 'leitor' });
      setUser({ uid: cred.user.uid, name: n, admin: false });
      setPass('');
    } catch (e) {
      Alert.alert('Não foi possível criar a conta', friendlyError(e));
    } finally {
      signingUp.current = false;
      setBusy(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setName('');
    setEmail('');
    setPass('');
    setSearch('');
  };

  const startEdit = (b: Book | null) => {
    setEditId(b?.id ?? null);
    setForm(
      b
        ? { name: b.name, year: b.year, writer: b.writer, publisher: b.publisher, genre: b.genre, pages: b.pages }
        : blank
    );
    setModal(true);
  };

  const save = async () => {
    if (Object.values(form).some((x) => !x.trim())) {
      Alert.alert('Campos obrigatórios', 'Preencha todos os campos.');
      return;
    }
    if (!/^\d{4}$/.test(form.year.trim()) || !/^[1-9]\d*$/.test(form.pages.trim())) {
      Alert.alert('Dados inválidos', 'Informe ano com quatro dígitos e páginas válidas.');
      return;
    }
    const payload: BookForm = {
      name: form.name.trim(),
      year: form.year.trim(),
      writer: form.writer.trim(),
      publisher: form.publisher.trim(),
      genre: form.genre.trim(),
      pages: form.pages.trim(),
    };
    setBusy(true);
    try {
      if (editId) await updateDoc(doc(db, 'livros', editId), payload);
      else await addDoc(collection(db, 'livros'), { ...payload, createdAt: serverTimestamp() });
      setModal(false);
    } catch (e) {
      Alert.alert('Erro ao salvar', friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (b: Book) =>
    Alert.alert('Remover livro', `Deseja remover "${b.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'livros', b.id));
          } catch (e) {
            Alert.alert('Erro ao remover', friendlyError(e));
          }
        },
      },
    ]);

  const importSeed = async () => {
    setBusy(true);
    try {
      for (const b of seed) {
        await addDoc(collection(db, 'livros'), { ...b, createdAt: serverTimestamp() });
      }
    } catch (e) {
      Alert.alert('Erro ao importar', friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!authReady) {
    return (
      <SafeAreaView style={s.center}>
        <Text>Carregando biblioteca...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" />
        <KeyboardAvoidingView style={s.login} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.mark}><Text style={{ fontSize: 28, color: '#365B48' }}>▤</Text></View>
          <Text style={s.eyebrow}>BIBLIOTECA DIGITAL</Text>
          <Text style={s.loginTitle}>{register ? 'Crie sua conta' : 'Bem-vindo(a).'}</Text>
          <Text style={s.muted}>
            {register ? 'Cadastre-se para consultar o catálogo.' : 'Entre para descobrir sua próxima leitura.'}
          </Text>
          <View style={s.card}>
            {register && <Input label="Nome" value={name} onChangeText={setName} />}
            <Input label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Input label="Senha" value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" />
            <Button
              title={busy ? 'Aguarde...' : register ? 'Criar conta' : 'Entrar'}
              onPress={register ? signup : enter}
              disabled={busy}
            />
            <TouchableOpacity onPress={() => setRegister(!register)} style={{ padding: 16, alignItems: 'center' }}>
              <Text style={s.link}>{register ? 'Já tenho uma conta · Entrar' : 'Não tem conta? Criar usuário'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={s.top}>
        <View>
          <Text style={s.eyebrow}>BIBLIOTECA DIGITAL</Text>
          <Text style={s.title}>Acervo</Text>
        </View>
        <Text style={s.role}>{user.admin ? 'ADMIN' : 'LEITOR'}</Text>
      </View>

      <View style={s.welcome}>
        <View style={{ flex: 1 }}>
          <Text style={s.welcomeTitle}>Olá, {user.name} 👋</Text>
          <Text style={s.muted}>Explore os livros disponíveis.</Text>
        </View>
        <TouchableOpacity onPress={logout}>
          <Text style={s.logout}>Sair</Text>
        </TouchableOpacity>
      </View>

      <View style={s.search}>
        <Text style={{ fontSize: 22, color: '#718174' }}>⌕</Text>
        <TextInput
          style={{ flex: 1, padding: 12, color: '#26382D' }}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar título, autor ou gênero"
          placeholderTextColor="#9A9A91"
        />
      </View>

      <View style={s.catalogHead}>
        <View>
          <Text style={s.section}>Todos os livros</Text>
          <Text style={s.count}>{filtered.length} livro(s) encontrado(s)</Text>
        </View>
        {user.admin && <Button title="+ Adicionar" onPress={() => startEdit(null)} small />}
      </View>

      <FlatList<Book>
        data={filtered}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 }}
        ListEmptyComponent={
          <View>
            <Text style={s.empty}>Nenhum livro encontrado.</Text>
            {user.admin && books.length === 0 && (
              <Button title="Importar livros de exemplo" onPress={importSeed} outline disabled={busy} />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.book}>
            <View style={s.cover}><Text style={{ fontSize: 25, color: '#55735D' }}>▤</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.genre}>{item.genre.toUpperCase()}</Text>
              <Text style={s.bookTitle}>{item.name}</Text>
              <Text style={s.muted}>por {item.writer}</Text>
              <Text style={s.meta}>{item.year}  ·  {item.pages} páginas</Text>
              <Text style={s.publisher}>{item.publisher}</Text>
              {user.admin && (
                <View style={s.actions}>
                  <TouchableOpacity onPress={() => startEdit(item)}><Text style={s.link}>Editar</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(item)}><Text style={s.delete}>Remover</Text></TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}
      />

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.section}>{editId ? 'Editar livro' : 'Cadastrar livro'}</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Text style={{ fontSize: 20, color: '#758176' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {fields.map(([k, l]) => (
                <Input
                  key={k}
                  label={l}
                  value={form[k]}
                  keyboardType={k === 'year' || k === 'pages' ? 'numeric' : 'default'}
                  onChangeText={(v) => setForm((old) => ({ ...old, [k]: v }))}
                />
              ))}
              <Button
                title={busy ? 'Salvando...' : editId ? 'Salvar alterações' : 'Cadastrar livro'}
                onPress={save}
                disabled={busy}
              />
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F3EE' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F3EE' },
  login: { flex: 1, justifyContent: 'center', padding: 25 },
  mark: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#DDE8DC', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  eyebrow: { color: '#66816D', letterSpacing: 2, fontSize: 10, fontWeight: '800' },
  loginTitle: { color: '#24372D', fontSize: 38, fontWeight: '800', marginTop: 10 },
  muted: { color: '#788078', fontSize: 13, marginTop: 5 },
  card: { backgroundColor: '#FFF', borderRadius: 22, padding: 20, marginTop: 28, elevation: 3 },
  field: { marginBottom: 14 },
  label: { color: '#405347', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  input: { backgroundColor: '#F7F8F5', borderWidth: 1, borderColor: '#E7EBE4', borderRadius: 12, padding: 13, color: '#26382D' },
  button: { backgroundColor: '#365B48', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 5 },
  buttonText: { color: '#FFF', fontWeight: '800' },
  small: { paddingVertical: 11, paddingHorizontal: 13 },
  outline: { backgroundColor: '#E7EEE6' },
  outlineText: { color: '#365B48' },
  disabled: { opacity: 0.5 },
  link: { color: '#52745C', fontWeight: '800', fontSize: 12 },
  top: { paddingHorizontal: 22, paddingTop: 17, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#24372D', fontSize: 31, fontWeight: '800' },
  role: { backgroundColor: '#E0EADF', color: '#45644D', fontSize: 10, fontWeight: '900', padding: 9, borderRadius: 18, overflow: 'hidden' },
  welcome: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 13 },
  welcomeTitle: { color: '#2D4034', fontSize: 17, fontWeight: '800' },
  logout: { color: '#A05249', fontWeight: '800', padding: 8 },
  search: { marginHorizontal: 20, marginTop: 8, backgroundColor: '#FFF', borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E9EBE5' },
  catalogHead: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { color: '#2A3D31', fontSize: 18, fontWeight: '800' },
  count: { color: '#879087', fontSize: 11, marginTop: 3 },
  book: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 12, flexDirection: 'row', elevation: 1 },
  cover: { width: 48, height: 66, borderRadius: 9, backgroundColor: '#E5EDE2', alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  genre: { color: '#789078', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  bookTitle: { color: '#2A3D31', fontSize: 16, fontWeight: '800', marginTop: 4 },
  meta: { color: '#68756A', fontSize: 11, marginTop: 8, fontWeight: '600' },
  publisher: { color: '#9A9F98', fontSize: 10, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#EEF0EB' },
  delete: { color: '#A64D43', fontWeight: '800', fontSize: 12 },
  empty: { textAlign: 'center', color: '#788078', marginTop: 50, marginBottom: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,32,24,.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#F9FAF7', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 21, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
});
