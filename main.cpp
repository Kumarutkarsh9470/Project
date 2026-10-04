#include<iostream>>
#include<queue>
class Queue{
    private:
    std::queue<int> q;
    public:
    void push(int value){
        q.push(value);
    }
    int pop(){
        int value=q.front();
        q.pop();
        return value;
    }
};
int main() {
    Queue q;

    q.push(10);
    q.push(20);
    q.push(30);

    std::cout << q.pop() << '\n';
    std::cout << q.pop() << '\n';
    std::cout << q.pop() << '\n';
}