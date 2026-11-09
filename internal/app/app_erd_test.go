package app

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestDBInspectSchema_EntityRelationship(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_erd.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("falha ao criar banco de teste: %v", err)
	}

	createDDL := `
	CREATE TABLE categorias (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		nome TEXT NOT NULL
	);

	CREATE TABLE produtos (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		categoria_id INTEGER,
		nome TEXT NOT NULL,
		preco REAL,
		FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON UPDATE CASCADE ON DELETE SET NULL
	);

	CREATE TABLE clientes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		email TEXT NOT NULL UNIQUE
	);

	CREATE TABLE pedidos (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		cliente_id INTEGER NOT NULL,
		data_pedido TEXT,
		FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
	);

	CREATE TABLE itens_pedido (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		pedido_id INTEGER NOT NULL,
		produto_id INTEGER NOT NULL,
		quantidade INTEGER DEFAULT 1,
		FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
		FOREIGN KEY (produto_id) REFERENCES produtos(id)
	);
	`

	if _, err := db.Exec(createDDL); err != nil {
		db.Close()
		t.Fatalf("falha ao executar DDL de teste: %v", err)
	}

	// Insere alguns dados de exemplo
	_, _ = db.Exec("INSERT INTO categorias (nome) VALUES ('Eletrônicos'), ('Livros');")
	_, _ = db.Exec("INSERT INTO produtos (categoria_id, nome, preco) VALUES (1, 'Notebook', 4500.0);")
	_, _ = db.Exec("INSERT INTO clientes (email) VALUES ('vitor@example.com');")
	db.Close()

	// Garante que o arquivo tem tamanho suficiente
	info, err := os.Stat(dbPath)
	if err != nil || info.Size() < 100 {
		t.Fatalf("arquivo de banco muito pequeno: %v", err)
	}

	appInstance := NewApp()
	schema, err := appInstance.DBInspectSchema(dbPath)
	if err != nil {
		t.Fatalf("DBInspectSchema retornou erro: %v", err)
	}

	if len(schema.Tables) != 5 {
		t.Fatalf("esperava 5 tabelas, obteve %d", len(schema.Tables))
	}

	// 1. Validar contagem de relacionamentos
	// produtos->categorias (1), pedidos->clientes (1), itens_pedido->pedidos (1), itens_pedido->produtos (1) = total 4
	if len(schema.Relationships) != 4 {
		t.Errorf("esperava 4 relacionamentos, obteve %d: %+v", len(schema.Relationships), schema.Relationships)
	}

	// 2. Validar que as colunas de FK foram marcadas com fk=true e fkTarget
	tableMap := make(map[string]DBObjectInfo)
	for _, tbl := range schema.Tables {
		tableMap[tbl.Name] = tbl
	}

	produtosTbl, ok := tableMap["produtos"]
	if !ok {
		t.Fatalf("tabela 'produtos' não encontrada no schema")
	}

	var catIdCol *DBColumnInfo
	for i := range produtosTbl.Columns {
		if produtosTbl.Columns[i].Name == "categoria_id" {
			catIdCol = &produtosTbl.Columns[i]
			break
		}
	}

	if catIdCol == nil {
		t.Fatalf("coluna 'categoria_id' não encontrada em produtos")
	}
	if !catIdCol.FK {
		t.Errorf("esperava categoria_id com FK=true")
	}
	if catIdCol.FKTarget != "categorias.id" {
		t.Errorf("esperava fkTarget 'categorias.id', obteve '%s'", catIdCol.FKTarget)
	}

	// 3. Validar integridade referencial ON DELETE CASCADE em pedidos
	pedidosTbl, ok := tableMap["pedidos"]
	if !ok {
		t.Fatalf("tabela 'pedidos' não encontrada no schema")
	}
	if len(pedidosTbl.ForeignKeys) != 1 {
		t.Fatalf("esperava 1 foreign key em pedidos, obteve %d", len(pedidosTbl.ForeignKeys))
	}
	fk := pedidosTbl.ForeignKeys[0]
	if fk.FromCol != "cliente_id" || fk.ToTable != "clientes" || fk.ToCol != "id" {
		t.Errorf("FK incorreta em pedidos: %+v", fk)
	}
	if fk.OnDelete != "CASCADE" {
		t.Errorf("esperava OnDelete 'CASCADE', obteve '%s'", fk.OnDelete)
	}
}

