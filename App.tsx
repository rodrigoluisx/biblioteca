import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, KeyboardTypeOptions, Modal, Platform,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

type BookForm = {
  name: string;
  year: string;
  writer: string;
  publisher: string;
  genre: string;
  pages: string;
};
type Book = BookForm & { id: string };
type StoredUser = { name: string; pass: string };
type Session = { name: string; admin: boolean };

const BK = '@biblioteca:books';
const UK = '@biblioteca:users';
const ADMIN = 'admin';
const ADMIN_PASS = '4321';

const seed: Book[] = [
  { id: '1', name: 'Dom Casmurro', year: '1899', writer: 'Machado de Assis', publisher: 'Garnier', genre: 'Romance', pages: '256' },
  { id: '2', name: 'O Pequeno Príncipe', year: '1943', writer: 'Antoine de Saint-Exupéry', publisher: 'Reynal & Hitchcock', genre: 'Fábula', pages: '96' },
  { id: '3', name: 'A Hora da Estrela', year: '1977', writer: 'Clarice Lispector', publisher: 'Rocco', genre: 'Romance', pages: '88' },
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

type ButtonProps = { title: string; onPress: () => void; small?: boolean; outline?: boolean };

function Button({ title, onPress, small, outline }: ButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.button, small && s.small, outline && s.outline]}>
      <Text style={[s.buttonText, outline && s.outlineText]}>{title}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [ready, setReady] = useState<boolean>(false);
  const [books, setBooks] = useState<Book[]>(seed);
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [user, setUser] = useState<Session | null>(null);
  const [name, setName] = useState<string>('');
  const [pass, setPass] = useState<string>('');
  const [register, setRegister] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [modal, setModal] = useState<boolean>(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<BookForm>(blank);

  useEffect(() => {
    (async () => {
      try {
        const b = await AsyncStorage.getItem(BK);
        const u = await AsyncStorage.getItem(UK);
        if (b) setBooks(JSON.parse(b) as Book[]);
        else await AsyncStorage.setItem(BK, JSON.stringify(seed));
        if (u) setUsers(JSON.parse(u) as StoredUser[]);
      } catch {
        Alert.alert('Aviso', 'Não foi possível carregar os dados.');
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persistBooks = async (v: Book[]) => {
    setBooks(v);
    await AsyncStorage.setItem(BK, JSON.stringify(v));
  };
  const persistUsers = async (v: StoredUser[]) => {
    setUsers(v);
    await AsyncStorage.setItem(UK, JSON.stringify(v));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter(
      (b) => !q || [b.name, b.writer, b.genre, b.publisher, b.year].some((x) => x.toLowerCase().includes(q))
    );
  }, [books, search]);

  const enter = () => {
    const n = name.trim();
    if (n.toLowerCase() === ADMIN && pass === ADMIN_PASS) {
      setUser({ name: ADMIN, admin: true });
      setPass('');
      return;
    }
    const u = users.find((x) => x.name.toLowerCase() === n.toLowerCase() && x.pass === pass);
    if (u) {
      setUser({ name: u.name, admin: false });
      setPass('');
    } else {
      Alert.alert('Acesso não autorizado', 'Confira seus dados ou crie uma conta.');
    }
  };

  const signup = async () => {
    const n = name.trim();
    if (n.length < 3 || pass.length < 4) {
      Alert.alert('Dados inválidos', 'Use usuário com 3 caracteres e senha com 4.');
      return;
    }
    if (n.toLowerCase() === ADMIN || users.some((x) => x.name.toLowerCase() === n.toLowerCase())) {
      Alert.alert('Usuário indisponível', 'Escolha outro nome.');
      return;
    }
    await persistUsers([...users, { name: n, pass }]);
    setUser({ name: n, admin: false });
    setPass('');
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
    const next: Book[] = editId
      ? books.map((b) => (b.id === editId ? { ...form, id: editId } : b))
      : [{ ...form, id: String(Date.now()) }, ...books];
    await persistBooks(next);
    setModal(false);
  };

  const remove = (b: Book) =>
    Alert.alert('Remover livro', `Deseja remover "${b.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => persistBooks(books.filter((x) => x.id !== b.id)) },
    ]);

  if (!ready) {
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
            <Input label="Usuário" value={name} onChangeText={setName} autoCapitalize="none" />
            <Input label="Senha" value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" />
            <Button title={register ? 'Criar conta' : 'Entrar'} onPress={register ? signup : enter} />
            <TouchableOpacity onPress={() => setRegister(!register)} style={{ padding: 16, alignItems: 'center' }}>
              <Text style={s.link}>{register ? 'Já tenho uma conta · Entrar' : 'Não tem conta? Criar usuário'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.hint}>Administrador: admin / 4321</Text>
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
        <TouchableOpacity onPress={() => { setUser(null); setName(''); setPass(''); setSearch(''); }}>
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
        ListEmptyComponent={<Text style={s.empty}>Nenhum livro encontrado.</Text>}
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
              <Button title={editId ? 'Salvar alterações' : 'Cadastrar livro'} onPress={save} />
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
  link: { color: '#52745C', fontWeight: '800', fontSize: 12 },
  hint: { textAlign: 'center', color: '#92988F', fontSize: 11, marginTop: 20 },
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
  empty: { textAlign: 'center', color: '#788078', marginTop: 50 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,32,24,.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#F9FAF7', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 21, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
});
